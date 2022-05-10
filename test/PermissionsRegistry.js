const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factorySetupCommunityWithRegisteredTM } = require("../utils/test-utils");

const IPermissionsRegistry = require("../artifacts/contracts/permissions_registry/IPermissionsRegistry.sol/IPermissionsRegistry.json");
const IPermissionsRegistryABI = IPermissionsRegistry["abi"];

describe("Permissions Registry", function () {
    let CommunityFactory;
    let factory;

    let Beacon;
    let BasicCommunityV1Impl;
    let TransferHooksTokenManager;
    let MinimalForwarder;
    let beacon;
    let minimalForwarder;
    let community;
    let basicTm;
    let permissionsRegistry;
    let transferHooksTm;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let addrs;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon"); 
        TransferHooksTokenManager = await ethers.getContractFactory("TransferHooksTokenManager2");
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, defaultAdmin, owner, permissionsRegistryAdmin, vault, ...addrs] = await ethers.getSigners();
        
        const impl = await BasicCommunityV1Impl.deploy();
        await impl.deployed();
        beacon = await Beacon.deploy(impl.address);
        await beacon.deployed();  
        minimalForwarder = await MinimalForwarder.deploy();
        await minimalForwarder.deployed();
        factory = await CommunityFactory.deploy(
            proxyAdminOwner.address, 
            minimalForwarder.address,
            minimalForwarder.address,
            highlight.address,
            permissionsRegistryAdmin.address,
            vault.address
        );
        await factory.deployed();

        permissionsRegistry = new ethers.Contract(await factory.permissionsRegistry(), IPermissionsRegistryABI, proxyAdminOwner);
    });

    beforeEach(async function () {
        // setup a community, basic tm, and token that we will play around with 
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(
            highlight,
            factory,
            beacon,
            creatorA.address,
            defaultAdmin.address,
            owner.address,
            addrs[0],
            "Test Community",
            "testuri.com"
        )

        basicTm = deployedBasicTm.connect(creatorA)
        const mintTx = await basicTm.mintNewTokensToOne(highlight.address, [100, 10], ["token 1 uri", "token 101 uri"], [true, false])
        await mintTx.wait();

        community = deployedCommunity

        transferHooksTm = await TransferHooksTokenManager.deploy(community.address);
        await transferHooksTm.deployed();
    })

    describe("Managing permissions registry", async function () {
        it("Permissions registry admin can swap the platform executor, affecting permissioned operations", async function () {
            permissionsRegistry = permissionsRegistry.connect(permissionsRegistryAdmin);

            await expect(permissionsRegistry.swapPlatformExecutor(fanA.address))
                .to.emit(permissionsRegistry, "PlatformExecutorSwapped")
                .withArgs(ethers.utils.getAddress(highlight.address), ethers.utils.getAddress(fanA.address))

            basicTm = basicTm.connect(fanA);
            community = community.connect(fanA);

            // functionality limited to platform executor or platform admin on a token manager
            await expect(basicTm.mintNewTokensToOne(highlight.address, [10], ["uri"], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(basicTm, "MintedNewTokensToOne")

            // functionality limited to platform executor or platform admin on the community
            await expect(community.unregisterTokenManager(basicTm.address))
                .to.emit(community, "TokenManagerUnregistered")
                .withArgs(ethers.utils.getAddress(basicTm.address), ethers.utils.getAddress(fanA.address))

            // functionality limited to platform executor in a subprotocol
            await expect(community["setTokenManager(uint256,address)"](1, transferHooksTm.address))
                .to.emit(community, "TokenManagerRegistered")
                .withArgs(ethers.utils.getAddress(transferHooksTm.address), ethers.utils.getAddress(fanA.address))
                .to.emit(community, "TokenManagerSet")
                .withArgs(1, ethers.utils.getAddress(transferHooksTm.address), ethers.utils.getAddress(fanA.address));
        })

        it("Non permissions registry admin cannot swap the platform executor", async function () {
            permissionsRegistry = permissionsRegistry.connect(fanA);
            await expect(permissionsRegistry.swapPlatformExecutor(highlight.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            permissionsRegistry = permissionsRegistry.connect(creatorA);
            await expect(permissionsRegistry.swapPlatformExecutor(highlight.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            permissionsRegistry = permissionsRegistry.connect(highlight);
            await expect(permissionsRegistry.swapPlatformExecutor(highlight.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            permissionsRegistry = permissionsRegistry.connect(highlightBeaconAdmin);
            await expect(permissionsRegistry.swapPlatformExecutor(highlight.address))
                .to.be.revertedWith("Ownable: caller is not the owner")
        })

        it("Non permissions registry admin cannot deprecate the platform executor", async function () {
            permissionsRegistry = permissionsRegistry.connect(fanA);
            await expect(permissionsRegistry.deprecatePlatformExecutor())
                .to.be.revertedWith("Ownable: caller is not the owner")

            permissionsRegistry = permissionsRegistry.connect(creatorA);
            await expect(permissionsRegistry.deprecatePlatformExecutor())
                .to.be.revertedWith("Ownable: caller is not the owner")

            permissionsRegistry = permissionsRegistry.connect(highlight);
            await expect(permissionsRegistry.deprecatePlatformExecutor())
                .to.be.revertedWith("Ownable: caller is not the owner")

            permissionsRegistry = permissionsRegistry.connect(highlightBeaconAdmin);
            await expect(permissionsRegistry.deprecatePlatformExecutor())
                .to.be.revertedWith("Ownable: caller is not the owner")
        })

        it("Permissions registry admin can deprecate the platform executor, affecting permissioned operations", async function () {
            permissionsRegistry = permissionsRegistry.connect(permissionsRegistryAdmin);
            await expect(permissionsRegistry.deprecatePlatformExecutor())
                .to.emit(permissionsRegistry, "PlatformExecutorDeprecated")
                .withArgs(fanA.address)

            basicTm = basicTm.connect(fanA);
            community = community.connect(fanA);

            // functionality limited to platform executor or platform admin on a token manager
            await expect(basicTm.mintNewTokensToOne(highlight.address, [10], ["uri"], [true]))
                .to.be.revertedWith("Unauthorized")

            // functionality limited to platform executor or platform admin on the community
            await expect(community.registerTokenManager(basicTm.address))
                .to.be.revertedWith("Unauthorized")

            // functionality limited to platform executor in a subprotocol
            await expect(community["setTokenManager(uint256,address)"](1, transferHooksTm.address))
                .to.be.revertedWith("Unauthorized")
        })
    })
})