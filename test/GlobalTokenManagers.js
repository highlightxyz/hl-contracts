const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    arrayToNum,
    factorySetupCommunityWithGlobalDefaultTMs,
    deployCommunityFactory2,
    deployGlobalBasicTokenManager,
    deployNonTransferableTokenManager
} = require("../utils/test-utils");

describe("GlobalTokenManagers", function () {
    let factory;

    let Proxy;
    let BasicTokenManager;
    let MinimalForwarder;
    let APIProxy;
    let community;
    let beacon;
    let basicTm;
    let nonTransferableTm;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let addrs;
    let api;

    before(async function () {
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon", highlightBeaconAdmin); 
        Proxy = await ethers.getContractFactory("BeaconProxy"); 
        BasicTokenManager = await ethers.getContractFactory("BasicTokenManager2");
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
        APIProxy = await ethers.getContractFactory("APIProxy"); 
        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, permissionsRegistryAdmin, vault, ...addrs] = await ethers.getSigners();
        
        const impl = await BasicCommunityV1Impl.deploy();
        await impl.deployed();
        beacon = await Beacon.deploy(impl.address);
        await beacon.deployed();  
        const minimalForwarder = await MinimalForwarder.deploy();
        await minimalForwarder.deployed();
        basicTm = await deployGlobalBasicTokenManager();
        nonTransferableTm = await deployNonTransferableTokenManager();
        factory = await deployCommunityFactory2(
            proxyAdminOwner.address, 
            minimalForwarder.address,
            minimalForwarder.address,
            highlight.address,
            permissionsRegistryAdmin.address,
            vault.address,
            [basicTm.address, nonTransferableTm.address],
            highlightBeaconAdmin.address
        );
        api = await APIProxy.deploy(await factory.splitMain())
        await api.deployed();
    });

    beforeEach(async function () {
        const { deployedCommunity } = await factorySetupCommunityWithGlobalDefaultTMs(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
    })

    describe("GlobalBasicTokenManager", function () {
        it("Minting multiple tokens to one recipient works", async function () {
            await expect(basicTm.mintNewTokensToOne(community.address, highlight.address, [10], [], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(basicTm, "MintedNewTokensToOne")
        })

        it("Minting one token to multiple recipients works", async function () {
            const recipients = [creatorA.address, fanA.address, addrs[0].address, addrs[1].address];
            const amounts = [10, 19, 150, 2000]

            await expect(basicTm.mintNewTokenToMultiple(community.address, recipients, amounts, "uri", true))
                .to.emit(community, "TransferSingle")
                .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", creatorA.address, 1, amounts[0])
                .to.emit(community, "TransferSingle")
                .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", fanA.address, 1, amounts[1])
                .to.emit(community, "TransferSingle")
                .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", addrs[0].address, 1, amounts[2])
                .to.emit(community, "TransferSingle")
                .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", addrs[1].address, 1, amounts[3])

            const ids = [1, 1, 1, 1];

            expect(arrayToNum(await community.balanceOfBatch(recipients, ids))).to.eql(amounts);
            expect(arrayToNum(await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(2179);
            expect(await community.uri(1)).to.equal("uri");
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(basicTm.address));
        })

        it("Only platform executor can swap global basic tm on a community", async function() {
            community = community.connect(creatorA);
            await expect(basicTm.mintNewTokensToOne(community.address, fanA.address, [10], [], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(community.setTokenManager(1, nonTransferableTm.address))
                .to.be.revertedWith("Unauthorized")

            community = community.connect(highlight);
            await expect(community.setTokenManager(1, nonTransferableTm.address))
                .emit(community, "TokenManagerSet")
                .withArgs(1, nonTransferableTm.address, highlight.address);

            community = community.connect(fanA);
            await expect(community.safeTransferFrom(fanA.address, addrs[0].address, 1, 1, ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("Non-transferable")
        })

        it("Only platform admins can set token metadata for a token on a community", async function () {
            community = community.connect(creatorA);
            await expect(basicTm.mintNewTokensToOne(community.address, fanA.address, [10], [], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(basicTm, "MintedNewTokensToOne")

            community = community.connect(fanA);

            await expect(community.setTokenURI(1, "dummy"))
                .to.be.revertedWith("Unauthorized")

            community = community.connect(creatorA);
            await expect(community.setTokenURI(1, "dummy"))
                .emit(community, "URI")
                .withArgs("dummy", 1);
        })
    })

    describe("NonTransferableTokenManager", function () {
        it("Minting multiple tokens to one recipient works", async function () {
            await expect(nonTransferableTm.mintNewTokensToOne(community.address, highlight.address, [10], [], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(nonTransferableTm, "MintedNewTokensToOne")
        })

        it("Minting one token to multiple recipients works", async function () {
            const recipients = [creatorA.address, fanA.address, addrs[0].address, addrs[1].address];
            const amounts = [10, 19, 150, 2000]

            await expect(nonTransferableTm.mintNewTokenToMultiple(community.address, recipients, amounts, "uri", true))
                .to.emit(community, "TransferSingle")
                .withArgs(ethers.utils.getAddress(nonTransferableTm.address), "0x0000000000000000000000000000000000000000", creatorA.address, 1, amounts[0])
                .to.emit(community, "TransferSingle")
                .withArgs(ethers.utils.getAddress(nonTransferableTm.address), "0x0000000000000000000000000000000000000000", fanA.address, 1, amounts[1])
                .to.emit(community, "TransferSingle")
                .withArgs(ethers.utils.getAddress(nonTransferableTm.address), "0x0000000000000000000000000000000000000000", addrs[0].address, 1, amounts[2])
                .to.emit(community, "TransferSingle")
                .withArgs(ethers.utils.getAddress(nonTransferableTm.address), "0x0000000000000000000000000000000000000000", addrs[1].address, 1, amounts[3])

            const ids = [1, 1, 1, 1];

            expect(arrayToNum(await community.balanceOfBatch(recipients, ids))).to.eql(amounts);
            expect(arrayToNum(await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(2179);
            expect(await community.uri(1)).to.equal("uri");
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(nonTransferableTm.address));
        })

        it("Only platform admin can swap nontransferable tm on a community", async function() {
            community = community.connect(creatorA);
            await expect(nonTransferableTm.mintNewTokensToOne(community.address, fanA.address, [10], [], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(nonTransferableTm, "MintedNewTokensToOne")

            community = community.connect(fanA);
            await expect(community.setTokenManager(1, basicTm.address))
                .to.be.revertedWith("Unauthorized")

                community = community.connect(creatorA);
            await expect(community.setTokenManager(1, basicTm.address))
                .emit(community, "TokenManagerSet")
                .withArgs(1, basicTm.address, creatorA.address);
        })

        it("Only platform admins can set token metadata for a token on a community", async function () {
            community = community.connect(creatorA);
            await expect(nonTransferableTm.mintNewTokensToOne(community.address, fanA.address, [10], [], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(nonTransferableTm, "MintedNewTokensToOne")

            community = community.connect(fanA);

            await expect(community.setTokenURI(1, "dummy"))
                .to.be.revertedWith("Unauthorized")

            community = community.connect(creatorA);
            await expect(community.setTokenURI(1, "dummy"))
                .emit(community, "URI")
                .withArgs("dummy", 1);
        })

        it("Transfers not initiated by the executor are paused", async function () {
            await expect(nonTransferableTm.mintNewTokensToOne(community.address, fanA.address, [10], [], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(nonTransferableTm, "MintedNewTokensToOne")
                
            community = community.connect(fanA);
            await expect(community.safeTransferFrom(fanA.address, addrs[0].address, 1, 1, ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("Non-transferable")
        })

        it("Transfers initiated by the executor are not paused", async function () {
            await expect(nonTransferableTm.mintNewTokensToOne(community.address, highlight.address, [10], [], [true]))
                .to.emit(community, "TransferSingle")
                .to.emit(nonTransferableTm, "MintedNewTokensToOne")
                
            community = community.connect(highlight);
            await expect(community.safeTransferFrom(highlight.address, addrs[0].address, 1, 1, ethers.utils.formatBytes32String("")))
                .to.emit(community, "TransferSingle")
        })
    })

    describe("Default global registered token managers", function () {
        it("Only the factory owner can change the global default registered token managers", async function () {
            factory = factory.connect(highlight);
            await expect(factory.setDefaultRegisteredTokenManagers([basicTm.address]))
                .to.be.revertedWith("Ownable: caller is not the owner")

            factory = factory.connect(creatorA);
            await expect(factory.setDefaultRegisteredTokenManagers([basicTm.address]))
                .to.be.revertedWith("Ownable: caller is not the owner")

            factory = factory.connect(fanA);
            await expect(factory.setDefaultRegisteredTokenManagers([basicTm.address]))
                .to.be.revertedWith("Ownable: caller is not the owner")

            factory = factory.connect(highlightBeaconAdmin);
            await expect(factory.setDefaultRegisteredTokenManagers([basicTm.address]))
                .to.emit(factory, "SetDefaultRegisteredTokenManagers")
                .withArgs([basicTm.address])

        })

        it("Changing the default registered token managers modifies the default token managers registered on a community on initial deployment", async function () {
            factory = factory.connect(highlightBeaconAdmin);
            await expect(factory.setDefaultRegisteredTokenManagers([nonTransferableTm.address]))
                .to.emit(factory, "SetDefaultRegisteredTokenManagers")
                .withArgs([nonTransferableTm.address])
            
            const { deployedCommunity: firstDeployedCommunity } = await factorySetupCommunityWithGlobalDefaultTMs(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
            expect(await firstDeployedCommunity.tokenManagers()).to.eql([nonTransferableTm.address])

            await expect(factory.setDefaultRegisteredTokenManagers([basicTm.address, nonTransferableTm.address]))
                .to.emit(factory, "SetDefaultRegisteredTokenManagers")
                .withArgs([basicTm.address, nonTransferableTm.address])

            const { deployedCommunity: secondDeployedCommunity } = await factorySetupCommunityWithGlobalDefaultTMs(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
            expect(await secondDeployedCommunity.tokenManagers()).to.eql([basicTm.address, nonTransferableTm.address])
        })

        it("The owner can transfer ownership to a new owner who can change the default registered token managers", async function () {
            factory = factory.connect(highlight);
            await expect(factory.setDefaultRegisteredTokenManagers([nonTransferableTm.address]))
                .to.be.revertedWith("Ownable: caller is not the owner")

            factory = factory.connect(highlightBeaconAdmin);
            await expect(factory.transferOwnership(highlight.address))
                .to.emit(factory, "OwnershipTransferred")
                .withArgs(highlightBeaconAdmin.address, highlight.address)

            await expect(factory.setDefaultRegisteredTokenManagers([nonTransferableTm.address]))
                .to.be.revertedWith("Ownable: caller is not the owner") 

            factory = factory.connect(highlight);
            await expect(factory.setDefaultRegisteredTokenManagers([nonTransferableTm.address]))
                .to.emit(factory, "SetDefaultRegisteredTokenManagers")
                .withArgs([nonTransferableTm.address])
        })
    })
})