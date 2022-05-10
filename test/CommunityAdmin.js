const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    factorySetupCommunityWithRegisteredTM, 
    DEFAULT_ADMIN_ROLE, 
    PLATFORM_ROLE, 
    COMMUNITY_ADMIN_ROLE 
} = require("../utils/test-utils");

describe("CommunityAdmin", function () {
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
        Beacon = await ethers.getContractFactory("UpgradeableBeacon"); 
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
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        community = community.connect(highlightBeaconAdmin)
        basicTm = deployedBasicTm

        tx = await basicTm.mintNewTokensToOne(fanA.address, [100, 100, 100], [], [true, false, true]);
        await tx.wait();
    })

    describe("Pausing", function () {
        it("Highlight default admin should be able to pause all non default-admin functionality on the contract", async function() {
            expect(await community.paused()).to.equal(false);
            
            await community.pause();
            expect(await community.paused()).to.equal(true);
            await expect(community.setTokenURI(1, "uri 1"))
                .to.be.revertedWith("Pausable: paused")
        });

        it("Highlight default admin should be able to unpause all non default-admin functionality on the contract", async function() {
            await community.pause();
            expect(await community.paused()).to.equal(true);

            await expect(community.setTokenURI(1, "uri 1"))
                .to.be.revertedWith("Pausable: paused")

            community = community.connect(highlightBeaconAdmin)

            await community.unpause();
            expect(await community.paused()).to.equal(false);

            community = community.connect(highlight)
            await community.setTokenURI(1, "uri 1")
            community = community.connect(fanA)
            await community.safeTransferFrom(fanA.address, creatorA.address, 1, 10, ethers.utils.formatBytes32String(""))

            expect(await community.uri(1)).to.equal("uri 1")
            expect(await community.balanceOf(creatorA.address, 1)).to.equal(10)
            expect(await community.balanceOf(fanA.address, 1)).to.equal(90)
        });

        it("Creators should not be able to pause a community", async function() {
            community = community.connect(creatorA);

            await expect(community.pause())
                .to.be.revertedWith(`AccessControl: account ${creatorA.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`)
        });

        it("Creators should not be able to unpause a community", async function() {
            await community.pause()
            community = community.connect(creatorA);

            await expect(community.unpause())
                .to.be.revertedWith(`AccessControl: account ${creatorA.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`)
        });

        it("Highlight platform admin should not be able to pause a community", async function() {
            community = community.connect(highlight);

            await expect(community.pause())
                .to.be.revertedWith(`AccessControl: account ${highlight.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`)
        });

        it("Highlight platform admin should not be able to unpause a community", async function() {
            await community.pause()
            community = community.connect(highlight);

            await expect(community.unpause())
                .to.be.revertedWith(`AccessControl: account ${highlight.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`)
        });
    })

    describe("Role ownership", function () {
        it("Highlight default admin can swap its default admin position with another account", async function () {
            expect(await community.hasRole(DEFAULT_ADMIN_ROLE, creatorA.address)).to.equal(false);

            await community.swapDefaultAdmin(creatorA.address);
            expect(await community.hasRole(await community.getRoleAdmin(PLATFORM_ROLE), creatorA.address)).to.equal(true);
            expect(await community.hasRole(DEFAULT_ADMIN_ROLE, highlight.address)).to.equal(false)

            await expect(community.grantRole(PLATFORM_ROLE, fanA.address))
                .to.be.revertedWith(`AccessControl: account ${highlightBeaconAdmin.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`)

            community = community.connect(creatorA);
            await community.pause()
            expect(await community.paused()).to.equal(true);
        })
    
        it("Platforms (highlight/creator initially) should be able to swap its platform position with another address", async function () {
            expect(await community.hasRole(PLATFORM_ROLE, fanA.address)).to.equal(false);
            expect(await community.hasRole(PLATFORM_ROLE, creatorA.address)).to.equal(true);
            
            community = community.connect(creatorA)
            await community.swapPlatform(fanA.address)

            expect(await community.hasRole(PLATFORM_ROLE, fanA.address)).to.equal(true);
            expect(await community.hasRole(PLATFORM_ROLE, creatorA.address)).to.equal(false);

            await expect(community.grantRole(COMMUNITY_ADMIN_ROLE, addrs[0].address))
                .to.be.revertedWith(`AccessControl: account ${creatorA.address.toLowerCase()} is missing role ${PLATFORM_ROLE}`)
        
            community = community.connect(fanA)
            await community.grantRole(COMMUNITY_ADMIN_ROLE, addrs[0].address);

            expect(await community.hasRole(COMMUNITY_ADMIN_ROLE, addrs[0].address)).to.equal(true); 

            await community.setTokenURI(1, "uri 1")
            expect(await community.uri(1)).to.equal("uri 1");
        })

    })
})