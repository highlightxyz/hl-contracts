const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    factorySetupCommunity,
    factoryDeployCommunity,
    factoryDeployCommunityReadManager,
    deployCommunityFactory2,
    deployGlobalBasicTokenManager,
} = require("../utils/test-utils");

describe("CommunityReadManagerV1", function () {
    let CommunityFactory;
    let factory;

    let Proxy;
    let BasicTokenManager;
    let CommunityReadManager;
    let MinimalForwarder;
    let community;
    let beacon;
    let communityManager;

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
        CommunityReadManager = await ethers.getContractFactory("CommunityReadManagerV1");
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");

        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, permissionsRegistryAdmin, vault, ...addrs] = await ethers.getSigners();
        
        const impl = await BasicCommunityV1Impl.deploy();
        await impl.deployed();
        beacon = await Beacon.deploy(impl.address);
        await beacon.deployed();  
        const minimalForwarder = await MinimalForwarder.deploy();
        await minimalForwarder.deployed();
        factory = await deployCommunityFactory2(
            proxyAdminOwner.address, 
            minimalForwarder.address,
            minimalForwarder.address,
            highlight.address,
            permissionsRegistryAdmin.address,
            vault.address,
            [(await deployGlobalBasicTokenManager()).address],
            highlightBeaconAdmin.address
        );
    });

    describe("Setting community metadata", function () {
        describe("Setting community metadata after setting up community", function () {
            beforeEach(async function () {
                const { deployedCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
                community = deployedCommunity
            })

            it("Default admin should be able to set the contract level metadata properly", async function () {
                community = community.connect(highlightBeaconAdmin);
                await expect(community.setContractMetadata(true, true, "test uri 2", "test 2"))
                    .to.emit(community, "ContractMetadataSet")
                    .withArgs(highlightBeaconAdmin.address, "test uri 2", "test 2", true, true); 
        
                expect(await community.contractURI()).to.equal("test uri 2");
                expect(await community.name()).to.equal("test 2");
        
                await expect(community.setContractMetadata(true, false, "test uri 3", "test 3"))
                    .to.emit(community, "ContractMetadataSet")
                    .withArgs(highlightBeaconAdmin.address, "test uri 3", "test 3", true, false); 
        
                expect(await community.contractURI()).to.equal("test uri 3");
                expect(await community.name()).to.equal("test 2");
        
                await expect(community.setContractMetadata(false, true, "test uri 4", "test 4"))
                    .to.emit(community, "ContractMetadataSet")
                    .withArgs(highlightBeaconAdmin.address, "test uri 4", "test 4", false, true); 
        
                expect(await community.contractURI()).to.equal("test uri 3");
                expect(await community.name()).to.equal("test 4");
            })

            it("Highlight platform executor be able to set the contract level metadata properly", async function () {
                community = community.connect(highlight);
                await expect(community.setContractMetadata(true, true, "test uri 2", "test 2"))
                    .to.emit(community, "ContractMetadataSet")
                    .withArgs(highlight.address, "test uri 2", "test 2", true, true)
            })
    
            it("Creator platform admin should not be able to set the contract level metadata properly", async function () {
                community = community.connect(creatorA);
                await expect(community.setContractMetadata(true, true, "test uri 2", "test 2"))
                    .to.be.revertedWith("Unauthorized")
            })
        
            it("Should not be able to set contract level metadata if both boolean inputs are false", async function ()  {
                await expect(community.setContractMetadata(false, false, "test uri 2", "test 2"))
                    .to.be.revertedWith("One has to be set")
            })
    
            it("Non highlight platform admins should not be able to set contract level metadata", async function ()  {
                community = community.connect(fanA)
                await expect(community.setContractMetadata(true, true, "test uri 2", "test 2"))
                    .to.be.revertedWith("Unauthorized")
    
                community = community.connect(addrs[0])
                await expect(community.setContractMetadata(true, true, "test uri 2", "test 2"))
                    .to.be.revertedWith("Unauthorized")
            })
        })

        describe("Setting community metadata on bare deployed community", function () {
            beforeEach(async function () {
                const { deployedCommunity } = await factoryDeployCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, "Test");
                community = deployedCommunity

                const { deployedCommunityReadManager } = await factoryDeployCommunityReadManager(highlight, factory, community.address);
                communityManager = deployedCommunityReadManager
            })

            it("Should not be able to set contract level metadata if CommunityReadManager isn't set", async function () {
                await expect(community.setContractMetadata(true, true, "test uri 2", "test 2"))
                    .to.be.revertedWith("Community manager not set")
            })

            it("Should be able to set contract level metadata after CommunityReadManager is set", async function () {
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.emit(community, "CommunityReadManagerSet")
                    .withArgs(ethers.utils.getAddress(communityManager.address), highlight.address);

                await expect(community.setContractMetadata(true, true, "test uri 2", "test 2"))
                    .to.emit(community, "ContractMetadataSet")
                    .withArgs(highlight.address, "test uri 2", "test 2", true, true); 
            })
        })
    })

    describe("Swapping CommunityReadManager", function () {
        describe("Swapping CommunityReadManager after setting up community", function () {
            beforeEach(async function () {
                const { deployedCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, addrs[0], "Test", "Test uri");
                community = deployedCommunity

                community = community.connect(highlight);

                const { deployedCommunityReadManager } = await factoryDeployCommunityReadManager(highlight, factory, community.address);
                communityManager = deployedCommunityReadManager
            })

            it("Default admin should not be able to swap CommunityReadManager", async function () {
                community = community.connect(highlightBeaconAdmin);
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.be.revertedWith("Unauthorized")
            })
    
            it("Non platform executors should not be able to swap CommunityReadManager", async function () {
                community = community.connect(creatorA);
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.be.revertedWith("Unauthorized");

                community = community.connect(fanA);
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.be.revertedWith("Unauthorized");

                community = community.connect(addrs[0]);
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.be.revertedWith("Unauthorized");
            })

            it("Platform executor should be able to swap CommunityReadManager", async function () {
                community = community.connect(highlight);
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.emit(community, "CommunityReadManagerSet")
                    .withArgs(ethers.utils.getAddress(communityManager.address), highlight.address);
            })
    
            it("Should not be able to swap CommunityReadManager for a non-interface implementing contract", async function () {
                await expect(community.setCommunityReadManager(community.address))
                    .to.be.revertedWith("Not a community manager");
            })

            it("Should not be able to swap CommunityReadManager for the same one", async function () {
                await expect(community.setCommunityReadManager(await community.communityManager()))
                    .to.be.revertedWith("Already set");
            })

            it("Should not be able to swap CommunityReadManager for one with another associated community", async function () {
                let { deployedCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");

                const { deployedCommunityReadManager } = await factoryDeployCommunityReadManager(highlight, factory, community.address);

                await expect(deployedCommunity.setCommunityReadManager(deployedCommunityReadManager.address))
                    .to.be.revertedWith("Wrong community's manager");
            })
        })
        
        describe("Swapping CommunityReadManager on bare deployed community", function () {
            beforeEach(async function () {
                const { deployedCommunity } = await factoryDeployCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, "Test");
                community = deployedCommunity

                const { deployedCommunityReadManager } = await factoryDeployCommunityReadManager(highlight, factory, community.address);
                communityManager = deployedCommunityReadManager
            })

            it("Highlight platform admin should be able to set CommunityReadManager", async function () {
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.emit(community, "CommunityReadManagerSet")
                    .withArgs(ethers.utils.getAddress(communityManager.address), highlight.address);
            })

            it("Creator platform admin should be able to set CommunityReadManager", async function () {
                community = community.connect(creatorA);
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.emit(community, "CommunityReadManagerSet")
                    .withArgs(ethers.utils.getAddress(communityManager.address), creatorA.address);
            })

            it("Non highlight platform admins should not be able to set CommunityReadManager", async function () {
                community = community.connect(fanA);
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.be.revertedWith("Unauthorized");

                community = community.connect(addrs[0]);
                await expect(community.setCommunityReadManager(communityManager.address))
                    .to.be.revertedWith("Unauthorized");
            })
        })
    })
});