const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factorySetupCommunityWithRegisteredTM, arrayToNum } = require("../utils/test-utils");

const IPermissionsRegistry = require("../artifacts/contracts/permissions_registry/IPermissionsRegistry.sol/IPermissionsRegistry.json");
const IPermissionsRegistryABI = IPermissionsRegistry["abi"];

describe("Token Distribution", function () {
    let CommunityFactory;
    let factory;

    let MinimalForwarder;
    let community;
    let beacon;
    let basicTm;
    let permissionsRegistry;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let addrs;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon"); 
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

        permissionsRegistry = new ethers.Contract(await factory.permissionsRegistry(), IPermissionsRegistryABI, permissionsRegistryAdmin);
    }); 

    beforeEach(async function () {
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        tx = await basicTm.mintNewTokensToOne(vault.address, [10, 20], [], [true, false]);
        await tx.wait();
    }); 

    describe("Vault", function () {
        beforeEach(function () {
            community = community.connect(highlight);
        });

        it("Platform executor should be able to transfer the vault's tokens", async function () {
            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);
        
            await community.safeTransferFrom(vault.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String(""))
            
            expect(await community.balanceOf(vault.address, 101)).to.equal(13);
            expect(await community.balanceOf(addrs[0].address, 101)).to.equal(7);
        });

        it("Platform executor should be able to batch transfer the vault's tokens", async function () {
            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);
        
            await community.safeBatchTransferFrom(vault.address, addrs[0].address, [1, 101], [3, 7], ethers.utils.formatBytes32String(""))
            
            expect(arrayToNum(await community.balanceOfBatch([vault.address, addrs[0].address, vault.address, addrs[0].address], [1, 1, 101, 101]))).to.eql([7, 3, 13, 7]);
        });

        it("Platform executor should be able to batch transfer (to multiple recipients) the vault's tokens", async function () {
            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);
        
            await community.safeBatchTransferFromMultipleRecipients(vault.address, [fanA.address, addrs[0].address], [1, 101], [2, 3], ethers.utils.formatBytes32String(""))
            
            expect(arrayToNum(await community.balanceOfBatch(
                [vault.address, addrs[0].address, fanA.address, vault.address, addrs[0].address, fanA.address], 
                [1, 1, 1, 101, 101, 101]
            ))).to.eql([6, 2, 2, 14, 3, 3]);
        });
    
        it("Changing the platform executor should change who can transfer the vault's tokens", async function () {
            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);

            expect(await permissionsRegistry.swapPlatformExecutor(creatorA.address))
                .to.emit(permissionsRegistry, "PlatformExecutorSwapped")
                .withArgs(highlight.address, creatorA.address)

            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(false);
            expect(await community.isApprovedForAll(vault.address, creatorA.address)).to.equal(true);

            await expect(community.safeTransferFrom(vault.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("ERC1155: caller unauthorized")

            await expect(community.safeBatchTransferFrom(fanA.address, addrs[0].address, [1, 101], [7, 7], ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("ERC1155: caller unauthorized")

            await expect(community.safeBatchTransferFromMultipleRecipients(vault.address, [fanA.address, addrs[0].address], [1, 101], [2, 3], ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("ERC1155: caller unauthorized")

            community = community.connect(creatorA)

            await expect(community.safeTransferFrom(vault.address, addrs[0].address, 101, 2, ethers.utils.formatBytes32String("")))
            await expect(community.safeBatchTransferFrom(vault.address, addrs[0].address, [1, 101], [3, 3], ethers.utils.formatBytes32String("")))
            await expect(community.safeBatchTransferFromMultipleRecipients(vault.address, [fanA.address, addrs[0].address], [1, 101], [2, 3], ethers.utils.formatBytes32String("")))
        })
    }); 
});