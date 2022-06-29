const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    factorySetupCommunityWithRegisteredTM, 
    arrayToNum,
    deployCommunityFactory2,
    deployGlobalBasicTokenManager
} = require("../utils/test-utils");

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

        permissionsRegistry = new ethers.Contract(await factory.permissionsRegistry(), IPermissionsRegistryABI, permissionsRegistryAdmin);
    });

    beforeEach(async function () {
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        tx = await basicTm.mintNewTokensToOne(vault.address, [40, 60], [], [true, false]);
        await tx.wait();
    });

    describe("Vault", function () {
        beforeEach(function () {
            community = community.connect(highlight);
        });

        it("Platform executor should be able to transfer the vault's tokens", async function () {
            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);

            await community.safeTransferFrom(vault.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String(""))

            expect(await community.balanceOf(vault.address, 101)).to.equal(53);
            expect(await community.balanceOf(addrs[0].address, 101)).to.equal(7);
        });

        it("Platform executor should be able to batch transfer the vault's tokens", async function () {
            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);

            await community.safeBatchTransferFrom(vault.address, addrs[0].address, [1, 101], [3, 7], ethers.utils.formatBytes32String(""))

            expect(arrayToNum(await community.balanceOfBatch([vault.address, addrs[0].address, vault.address, addrs[0].address], [1, 1, 101, 101]))).to.eql([37, 3, 53, 7]);
        });

        it("Platform executor should be able to batch transfer (to multiple recipients) the vault's tokens", async function () {
            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);

            await community.safeBatchTransferFromMultipleRecipients(vault.address, [fanA.address, addrs[0].address], [1, 101], [2, 3], ethers.utils.formatBytes32String(""))

            expect(arrayToNum(await community.balanceOfBatch(
                [vault.address, addrs[0].address, fanA.address, vault.address, addrs[0].address, fanA.address],
                [1, 1, 1, 101, 101, 101]
            ))).to.eql([36, 2, 2, 54, 3, 3]);
        });

        it("Adding new platform executor should allow transfer of vault's tokens from all active executors", async function () {
          expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);

          expect(await permissionsRegistry.addPlatformExecutor(creatorA.address))
            .to.emit(permissionsRegistry, "PlatformExecutorAdded")
            .withArgs(creatorA.address)

          expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);
          expect(await community.isApprovedForAll(vault.address, creatorA.address)).to.equal(true);

          await expect(community.safeTransferFrom(vault.address, addrs[0].address, 101, 2, ethers.utils.formatBytes32String("")))
          await expect(community.safeBatchTransferFrom(vault.address, addrs[0].address, [1, 101], [3, 3], ethers.utils.formatBytes32String("")))
          await expect(community.safeBatchTransferFromMultipleRecipients(vault.address, [fanA.address, addrs[0].address], [1, 101], [2, 3], ethers.utils.formatBytes32String("")))

          community = community.connect(creatorA)

          await expect(community.safeTransferFrom(vault.address, addrs[0].address, 101, 2, ethers.utils.formatBytes32String("")))
          await expect(community.safeBatchTransferFrom(vault.address, addrs[0].address, [1, 101], [3, 3], ethers.utils.formatBytes32String("")))
          await expect(community.safeBatchTransferFromMultipleRecipients(vault.address, [fanA.address, addrs[0].address], [1, 101], [2, 3], ethers.utils.formatBytes32String("")))
        });

        it("Changing the platform executor should change who can transfer the vault's tokens", async function () {
            expect(await community.isApprovedForAll(vault.address, highlight.address)).to.equal(true);
            expect(await community.isApprovedForAll(vault.address, creatorA.address)).to.equal(true);

            expect(await permissionsRegistry.deprecatePlatformExecutor(highlight.address))
              .to.emit(permissionsRegistry, "PlatformExecutorDeprecated")
              .withArgs(highlight.address)

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
