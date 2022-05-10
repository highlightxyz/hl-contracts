const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    factorySetupCommunity, 
    factorySetupCommunityWithRegisteredTM, 
    factorySetupCommunityWithClone,
    factorySetupCommunityWithRegisteredClone,
    COMMUNITY_DEPLOYED_TOPIC_HASH,
    TOKEN_MANAGER_DEPLOYED_TOPIC_HASH
} = require("../utils/test-utils");

const BasicCommunityV1 = require("../artifacts/contracts/community/implementation/BasicCommunityV1.sol/BasicCommunityV1.json");
const BasicCommunityV1ABI = BasicCommunityV1["abi"];

const BasicTokenManager = require("../artifacts/contracts/token_manager/V2/implementation/BasicTokenManager2.sol/BasicTokenManager2.json");
const BasicTokenManagerABI = BasicTokenManager["abi"];

const ICommunityAdmin = require("../artifacts/contracts/community/interfaces/ICommunityAdmin.sol/ICommunityAdmin.json");
const ICommunityAdminABI = ICommunityAdmin["abi"];

describe("CommunityFactory", function () {
    let CommunityFactory;
    let factory;

    let Proxy;
    let BasicTokenManager;
    let MinimalForwarder;
    let community;
    let beacon;
    let basicTm;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let addrs;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon", highlightBeaconAdmin); 
        Proxy = await ethers.getContractFactory("BeaconProxy"); 
        BasicTokenManager = await ethers.getContractFactory("BasicTokenManager2");
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, permissionsRegistryAdmin, vault, ...addrs] = await ethers.getSigners();
        
        const impl = await BasicCommunityV1Impl.deploy();
        await impl.deployed();
        beacon = await Beacon.deploy(impl.address);
        await beacon.deployed();  
        const minimalForwarder = await MinimalForwarder.deploy();
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
    });

    beforeEach(async function () {
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        let tx = await community.registerTokenManager(basicTm.address);
        await tx.wait();

        tx = await basicTm.mintNewTokensToOne(fanA.address, [100, 100, 100], [], [true, false, true]);
        await tx.wait();
    })

    it("Highlight should be able to deploy a functioning BasicCommunity via the factory", async function () {
        let tx = await factory.deployCommunity(beacon.address, creatorA.address, highlight.address, highlight.address, "Test", 0)
        const receipt = await tx.wait();
        var communityAddress = "";

        for (const log of receipt.logs) {
            if (log.topics[0] == COMMUNITY_DEPLOYED_TOPIC_HASH) {
                communityAddress = "0x" + log.topics[1].slice(26);
            }
        }   
        community = new ethers.Contract(communityAddress, BasicCommunityV1ABI, highlight);
        
        await expect(community.registerTokenManager(basicTm.address))
            .to.emit(community, "TokenManagerRegistered")
            .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address);
    });

    it("Highlight should be able to deploy a functioning BasicTokenManager via the factory", async function () {
        let tx = await factory.deployBasicTokenManager(community.address)
        const receipt = await tx.wait();
        var tokenManagerAddress = "";

        for (const log of receipt.logs) {
            if (log.topics[0] == TOKEN_MANAGER_DEPLOYED_TOPIC_HASH) {
                tokenManagerAddress = "0x" + log.topics[1].slice(26);
            }
        }   
        basicTm = new ethers.Contract(tokenManagerAddress, BasicTokenManagerABI, highlight);
        
        await expect(community.registerTokenManager(basicTm.address))
            .to.emit(community, "TokenManagerRegistered")
            .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address);

        await expect(basicTm.mintNewTokensToOne(fanA.address, [100, 100, 100], [], [true, false, true]))
    });

    it("Highlight should be able to deploy a functioning BasicTokenManager clone via the factory", async function () {
        let tx = await factory.deployBasicTokenManagerClone(community.address)
        const receipt = await tx.wait();
        var tokenManagerAddress = "";

        for (const log of receipt.logs) {
            if (log.topics[0] == TOKEN_MANAGER_DEPLOYED_TOPIC_HASH) {
                tokenManagerAddress = "0x" + log.topics[1].slice(26);
            }
        }   
        basicTm = new ethers.Contract(tokenManagerAddress, BasicTokenManagerABI, highlight);
        
        await expect(community.registerTokenManager(basicTm.address))
            .to.emit(community, "TokenManagerRegistered")
            .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address);

        await expect(basicTm.mintNewTokensToOne(fanA.address, [100, 100, 100], [], [true, false, true]))
    });

    it("Highlight should be able to setup a functioning community via the factory", async function () {
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        await expect(community.registerTokenManager(basicTm.address))
            .to.emit(community, "TokenManagerRegistered")
            .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address);

        await expect(basicTm.mintNewTokensToOne(fanA.address, [100, 100, 100], [], [true, false, true]))
    });

    it("Highlight should be able to setup a functioning community with a registered token manager via the factory", async function () {
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        await expect(basicTm.mintNewTokensToOne(fanA.address, [100, 100, 100], [], [true, false, true]));

        community = new ethers.Contract(community.address, ICommunityAdminABI, highlight);
        expect(await community.hasPlatformRole(factory.address)).to.equal(false);
    });

    it("Highlight should be able to setup a functioning community using token manager clones via the factory", async function () {
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithClone(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        await expect(community.registerTokenManager(basicTm.address))
            .to.emit(community, "TokenManagerRegistered")
            .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address);

        await expect(basicTm.mintNewTokensToOne(fanA.address, [100, 100, 100], [], [true, false, true]))
    });

    it("Highlight should be able to setup a functioning community with registered token manager clones via the factory", async function () {
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredClone(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        await expect(basicTm.mintNewTokensToOne(fanA.address, [100, 100, 100], [], [true, false, true]))

        community = new ethers.Contract(community.address, ICommunityAdminABI, highlight);
        expect(await community.hasPlatformRole(factory.address)).to.equal(false);
    });
})