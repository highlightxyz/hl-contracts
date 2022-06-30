const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    factorySetupCommunityWithRegisteredTM, 
    factorySetupCommunity,
    deployCommunityFactory2,
    deployGlobalBasicTokenManager,
    arrayToNum, 
    EIP1967AdminStorageSlot, 
    EIP1967ImplementationStorageSlot 
} = require("../utils/test-utils");

const BasicCommunityV2Test = require("../artifacts/contracts/test/BasicCommunityV2Test.sol/BasicCommunityV2Test.json");
const BasicCommunityV2TestABI = BasicCommunityV2Test["abi"];

const BeaconProxy = require("../artifacts/contracts/community/BeaconProxy.sol/BeaconProxy.json");
const { assert } = require("console");
const BeaconProxyABI = BeaconProxy["abi"];

const SplitMain = require("../artifacts/contracts/royalties/SplitMain.sol/SplitMain.json");
const SplitMainABI = SplitMain["abi"]

const TransparentUpgradeableProxy = require("../artifacts/contracts/utils/Proxy/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json");
const TransparentUpgradeableProxyABI = TransparentUpgradeableProxy["abi"]

const ProxyAdmin = require("../artifacts/contracts/utils/Proxy/ProxyAdmin.sol/ProxyAdmin.json");
const ProxyAdminABI = ProxyAdmin["abi"]

const ISplitMain = require("../artifacts/contracts/royalties/interfaces/ISplitMain.sol/ISplitMain.json");
const ISplitMainABI = ISplitMain["abi"];

const SplitMainV2Test = require("../artifacts/contracts/test/SplitMainV2Test.sol/SplitMainV2Test.json");
const SplitMainV2TestABI = SplitMainV2Test["abi"];

const PermissionsRegistryV2Test = require("../artifacts/contracts/test/PermissionsRegistryV2Test.sol/PermissionsRegistryV2Test.json");
const PermissionsRegistryV2TestABI = PermissionsRegistryV2Test["abi"];

const IPermissionsRegistry = require("../artifacts/contracts/permissions_registry/IPermissionsRegistry.sol/IPermissionsRegistry.json");
const IPermissionsRegistryABI = IPermissionsRegistry["abi"];

describe("Community Upgrades", function () {
    let CommunityFactory;
    let factory;

    let Beacon; 
    let BasicCommunityV1Impl;
    let BasicCommunityV2Test;
    let MinimalForwarder;
    let community;
    let community2;
    let beacon;
    let basicTm;
    let basicTm2;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let addrs;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        BasicCommunityV2Test = await ethers.getContractFactory("BasicCommunityV2Test");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon"); 
        TransferHooksTokenManager = await ethers.getContractFactory("TransferHooksTokenManager2");
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

    beforeEach(async function () {
        const { deployedCommunity, deployedBasicTm } 
            = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm 
        
        const { deployedCommunity: deployedCommunity2, deployedBasicTm: deployedBasicTm2 } 
            = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community2 = deployedCommunity2
        basicTm2 = deployedBasicTm2

        tx = await basicTm.mintNewTokensToOne(fanA.address, [10, 20], [], [true, false]);
        await tx.wait();

        tx = await basicTm2.mintNewTokensToOne(fanA.address, [10, 20], [], [true, false]);
        await tx.wait();
    })

    it("Highlight should be able to upgrade communities without having to migrate community state, or upgrading communities individually", async function () {
        const initialImplementation = await beacon.implementation()
        BasicCommunityV2Test = BasicCommunityV2Test.connect(highlight)

        v2Test = await BasicCommunityV2Test.deploy();
        await v2Test.deployed()

        await beacon.upgradeTo(v2Test.address);

        expect(await beacon.implementation()).to.not.equal(initialImplementation);

        community = new ethers.Contract(community.address, BasicCommunityV2TestABI, highlight);
        community2 = new ethers.Contract(community2.address, BasicCommunityV2TestABI, highlight);

        expect(await community.version()).to.equal("v2Test");
        expect(await community.balanceOf(fanA.address, 1)).to.equal(10);

        community = community.connect(fanA);
        await community.safeTransferFrom(fanA.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String(""))

        expect(arrayToNum(await community.balanceOfBatch([fanA.address, addrs[0].address], [101, 101]))).to.eql([13, 7]);

        expect(await community2.version()).to.equal("v2Test");
        expect(await community2.balanceOf(fanA.address, 1)).to.equal(10);

        community2 = community2.connect(fanA);
        await community2.safeTransferFrom(fanA.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String(""))

        expect(arrayToNum(await community2.balanceOfBatch([fanA.address, addrs[0].address], [101, 101]))).to.eql([13, 7]);
    });

    it("Highlight default admin should be able to update the beacon a community points to", async function () {
        community2 = new ethers.Contract(community.address, BeaconProxyABI, highlightBeaconAdmin);

        BasicCommunityV2Test = BasicCommunityV2Test.connect(highlight)
        v2Test = await BasicCommunityV2Test.deploy();
        await v2Test.deployed();

        const beacon2 = await Beacon.deploy(v2Test.address);
        
        await expect(community2.upgradeBeaconToAndCall(beacon2.address, ethers.utils.arrayify("0x"), false))
            .to.emit(community2, "BeaconUpgraded")
            .withArgs(beacon2.address);

        community = new ethers.Contract(community.address, BasicCommunityV2TestABI, highlight);
        community2 = new ethers.Contract(community2.address, BasicCommunityV2TestABI, highlight);

        try {
            await community.version();
            assert.fail("Community 1 should not have a version function")
        } catch(error) {}
        expect(await community2.version()).to.equal("v2Test");
    });

    it("No one other than Highlight should be able to update the beacon a community points to", async function () {
        community2 = new ethers.Contract(community.address, BeaconProxyABI, creatorA);

        BasicCommunityV2Test = BasicCommunityV2Test.connect(highlight)
        v2Test = await BasicCommunityV2Test.deploy();
        await v2Test.deployed();

        const beacon2 = await Beacon.deploy(v2Test.address);
        
        await expect(community2.upgradeBeaconToAndCall(beacon2.address, ethers.constants.HashZero, false))
            .to.be.revertedWith("Unauthorized")

        community2.connect(fanA);
        await expect(community2.upgradeBeaconToAndCall(beacon2.address, ethers.constants.HashZero, false))
            .to.be.revertedWith("Unauthorized")
    });

    it("No one can initialize a community after setup", async function () {
        await expect(community.initialize(creatorA.address, highlight.address, highlight.address, highlight.address, "skl", highlight.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    })
});

describe("SplitMain (royalty manager) Upgrades", function () {
    let CommunityFactory;
    let factory;

    let Beacon; 
    let MinimalForwarder;
    let BasicCommunityV1Impl;
    let beacon;
    let minimalForwarder;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let proxyAdminOwner;
    let addrs;

    let splitMain;
    let defaultSplit;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon", highlightBeaconAdmin); 
        CommunityReadManager = await ethers.getContractFactory("CommunityReadManagerV1");
        MockERC20 = await ethers.getContractFactory("MockERC20");
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");

        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, permissionsRegistryAdmin, vault, ...addrs] = await ethers.getSigners();
        
        const impl = await BasicCommunityV1Impl.deploy();
        await impl.deployed();
        beacon = await Beacon.deploy(impl.address);
        await beacon.deployed();  
        minimalForwarder = await MinimalForwarder.deploy();
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
        mockERC20 = await MockERC20.deploy("Mock", "MK", [highlight.address, creatorA.address, fanA.address, highlightBeaconAdmin.address, addrs[0].address]);
        await mockERC20.deployed();

        splitMain = new ethers.Contract(await factory.splitMain(), SplitMainABI, highlight);

        defaultSplit = {
            set: 1,
            secondaryAccounts: [fanA.address, creatorA.address],
            primaryAllocation: 300000,
            secondaryAllocations: [350000, 350000],
            distributorFee: 0,
            primaryController: highlight.address,
            secondaryControllers: [highlight.address, creatorA.address]
        }
    });

    it("TransparentProxy, ProxyAdmin and implementation of SplitMain are configured properly on factory deployment", async function () {
        const splitMainProxy = new ethers.Contract(await factory.splitMain(), TransparentUpgradeableProxyABI, highlight);
        
        await expect(splitMainProxy.admin())
            .to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function")

        await expect(splitMainProxy.implementation())
            .to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function")
        
        expect(ethers.utils.getAddress("0x" + (await highlight.provider.getStorageAt(splitMainProxy.address, EIP1967AdminStorageSlot)).slice(26))).to.equal(await factory.proxyAdmin());

        const proxyAdmin = new ethers.Contract(await factory.proxyAdmin(), ProxyAdminABI, highlight); 
        expect(await proxyAdmin.getProxyAdmin(splitMainProxy.address)).to.equal(proxyAdmin.address); 
        expect(await proxyAdmin.getProxyImplementation(splitMainProxy.address)).to.equal(ethers.utils.getAddress("0x" + (await highlight.provider.getStorageAt(splitMainProxy.address, EIP1967ImplementationStorageSlot)).slice(26)));
    
        expect(await proxyAdmin.owner()).to.equal(proxyAdminOwner.address);
    })

    it("No one can initialize SplitMain after factory deployment", async function () {
        const splitMainProxy = new ethers.Contract(await factory.splitMain(), ISplitMainABI, highlight);

        await expect(splitMainProxy.initialize(minimalForwarder.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    })

    describe("Verifying SplitMain upgrades", async function () {
        let newImplementation;

        beforeEach(async function() {
            const SplitMainV2Test = await ethers.getContractFactory("SplitMainV2Test");
            newImplementation = await SplitMainV2Test.deploy();
            await newImplementation.deployed();
        })

        it("An account other than the proxy admin owner cannot upgrade the SplitMain contract", async function () {
            let proxyAdmin = new ethers.Contract(await factory.proxyAdmin(), ProxyAdminABI, highlight);
            await expect(proxyAdmin.upgrade(splitMain.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            proxyAdmin = proxyAdmin.connect(creatorA);
            await expect(proxyAdmin.upgrade(splitMain.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            proxyAdmin = proxyAdmin.connect(fanA);
            await expect(proxyAdmin.upgrade(splitMain.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")
        })

        it("Highlight proxy admin owner can upgrade the contract and all data pre-upgrade is preserved", async function () {
            // SETUP

            const { deployedCommunity: setupCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, addrs[0], "Test", "Test uri");

            const split = await setupCommunity.royaltySplit()
            splitMain = splitMain.connect(highlight)

            // send ETH and ERC20 to the split
            const ethTx = await fanA.sendTransaction({
                to: split,
                value: ethers.utils.parseEther("1.0")
            })
            await ethTx.wait();
            

            mockERC20 = mockERC20.connect(fanA)
            const erc20Tx = await mockERC20.transferFrom(fanA.address, split, 100);
            await erc20Tx.wait();

            let distributeTx = await splitMain.distributeETH(split, highlightBeaconAdmin.address)
            await distributeTx.wait();

            distributeTx = await splitMain.distributeERC20(split, mockERC20.address, highlightBeaconAdmin.address)
            await distributeTx.wait();

            const updateSplitTx = await splitMain.updateSplit(split, { ...defaultSplit, primaryAllocation: 400000, secondaryAllocations: [500000, 100000] } )
            await updateSplitTx.wait();

            splitMain = splitMain.connect(addrs[0])
            const revokeSecondaryControllerTx = await splitMain.revokeSecondaryController(split, addrs[0].address);
            await revokeSecondaryControllerTx.wait();

            // VERIFY DATA BEFORE

            expect(await splitMain.getSplit(split)).to.eql([
                1,
                400000,
                0,
                [500000, 100000],
                highlight.address,
                [creatorA.address],
                [fanA.address, creatorA.address],
            ])
            expect(await splitMain.getETHBalance(highlight.address)).to.equal(ethers.utils.parseEther("0.3"))
            expect(await splitMain.getETHBalance(creatorA.address)).to.equal(ethers.utils.parseEther("0.7"))
            expect(await splitMain.getETHBalance(split)).to.equal(ethers.utils.parseEther("0.0"))
            expect(await splitMain.getERC20Balance(highlight.address, mockERC20.address)).to.equal(29)
            expect(await splitMain.getERC20Balance(creatorA.address, mockERC20.address)).to.equal(69)
            expect(await splitMain.getERC20Balance(split, mockERC20.address)).to.equal(1) 

            // UPGRADE

            const proxyAdmin = new ethers.Contract(await factory.proxyAdmin(), ProxyAdminABI, proxyAdminOwner);
            await expect(proxyAdmin.upgrade(splitMain.address, newImplementation.address))

            // VERIFY OLD DATA AFTER

            expect(await splitMain.getSplit(split)).to.eql([
                1,
                400000,
                0,
                [500000, 100000],
                highlight.address,
                [creatorA.address],
                [fanA.address, creatorA.address],
            ])
            expect(await splitMain.getETHBalance(highlight.address)).to.equal(ethers.utils.parseEther("0.3"))
            expect(await splitMain.getETHBalance(creatorA.address)).to.equal(ethers.utils.parseEther("0.7"))
            expect(await splitMain.getETHBalance(split)).to.equal(ethers.utils.parseEther("0.0"))
            expect(await splitMain.getERC20Balance(highlight.address, mockERC20.address)).to.equal(29)
            expect(await splitMain.getERC20Balance(creatorA.address, mockERC20.address)).to.equal(69)
            expect(await splitMain.getERC20Balance(split, mockERC20.address)).to.equal(1) 

            // VERIFY NEW FUNCTIONALITY

            const splitMainV2 = new ethers.Contract(splitMain.address, SplitMainV2TestABI, highlight); 
            expect(await splitMainV2.version()).to.equal("v2Test"); 
        })

        it("Proxy admin owner can transfer ownership, and the new owner can upgrade the SplitMain contract", async function () {
            let proxyAdmin = new ethers.Contract(await factory.proxyAdmin(), ProxyAdminABI, highlight);
            await expect(proxyAdmin.upgrade(splitMain.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            proxyAdmin = proxyAdmin.connect(proxyAdminOwner);
            await expect(proxyAdmin.transferOwnership(highlight.address))
                
            await expect(proxyAdmin.upgrade(splitMain.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            proxyAdmin = proxyAdmin.connect(highlight);
            await expect(proxyAdmin.upgrade(splitMain.address, newImplementation.address))
        })
    })
});

describe("PermissionsRegistry Upgrades", function () {
    let CommunityFactory;
    let factory;

    let Beacon; 
    let MinimalForwarder;
    let BasicCommunityV1Impl;
    let beacon;
    let minimalForwarder;
    let permissionsRegistry;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let proxyAdminOwner;
    let addrs;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon", highlightBeaconAdmin); 
        CommunityReadManager = await ethers.getContractFactory("CommunityReadManagerV1");
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");

        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, permissionsRegistryAdmin, vault, ...addrs] = await ethers.getSigners();
        
        const impl = await BasicCommunityV1Impl.deploy();
        await impl.deployed();
        beacon = await Beacon.deploy(impl.address);
        await beacon.deployed();  
        minimalForwarder = await MinimalForwarder.deploy();
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
        
        permissionsRegistry = new ethers.Contract(await factory.permissionsRegistry(), IPermissionsRegistryABI, proxyAdminOwner);
    });

    it("TransparentProxy, ProxyAdmin and implementation of PermissionsRegistry are configured properly on factory deployment", async function () {
        const permissionsRegistryProxy = new ethers.Contract(permissionsRegistry.address, TransparentUpgradeableProxyABI, highlight);
        
        await expect(permissionsRegistryProxy.admin())
            .to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function")

        await expect(permissionsRegistryProxy.implementation())
            .to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function")
        
        expect(ethers.utils.getAddress("0x" + (await highlight.provider.getStorageAt(permissionsRegistryProxy.address, EIP1967AdminStorageSlot)).slice(26))).to.equal(await factory.proxyAdmin());

        const proxyAdmin = new ethers.Contract(await factory.proxyAdmin(), ProxyAdminABI, highlight); 
        expect(await proxyAdmin.getProxyAdmin(permissionsRegistryProxy.address)).to.equal(proxyAdmin.address); 
        expect(await proxyAdmin.getProxyImplementation(permissionsRegistryProxy.address)).to.equal(ethers.utils.getAddress("0x" + (await highlight.provider.getStorageAt(permissionsRegistryProxy.address, EIP1967ImplementationStorageSlot)).slice(26)));
    
        expect(await proxyAdmin.owner()).to.equal(proxyAdminOwner.address);
    })

    it("No one can initialize PermissionsRegistry after factory deployment", async function () {
        const permissionsRegistryProxy = new ethers.Contract(permissionsRegistry.address, IPermissionsRegistryABI, highlight);

        await expect(permissionsRegistryProxy.initialize(highlight.address, highlight.address))
            .to.be.revertedWith("Initializable: contract is already initialized");
    })

    describe("Verifying PermissionsRegistry upgrades", async function () {
        let newImplementation;

        beforeEach(async function() {
            const PermissionsRegistryV2Test = await ethers.getContractFactory("PermissionsRegistryV2Test");
            newImplementation = await PermissionsRegistryV2Test.deploy();
            await newImplementation.deployed();
        })

        it("An account other than the proxy admin owner cannot upgrade the PermissionReigstry contract", async function () {
            let proxyAdmin = new ethers.Contract(await factory.proxyAdmin(), ProxyAdminABI, highlight);
            await expect(proxyAdmin.upgrade(permissionsRegistry.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            proxyAdmin = proxyAdmin.connect(creatorA);
            await expect(proxyAdmin.upgrade(permissionsRegistry.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            proxyAdmin = proxyAdmin.connect(fanA);
            await expect(proxyAdmin.upgrade(permissionsRegistry.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")
        })

        it("Highlight proxy admin owner can upgrade the contract and all data pre-upgrade is preserved", async function () {
            // VERIFY DATA BEFORE

            expect(await permissionsRegistry.isPlatformExecutor(highlight.address)).to.equal(true);

            // UPGRADE

            const proxyAdmin = new ethers.Contract(await factory.proxyAdmin(), ProxyAdminABI, proxyAdminOwner);
            await expect(proxyAdmin.upgrade(permissionsRegistry.address, newImplementation.address))

            // VERIFY OLD DATA AFTER

            expect(await permissionsRegistry.isPlatformExecutor(highlight.address)).to.equal(true);

            // VERIFY NEW FUNCTIONALITY

            const permissionsRegistryV2 = new ethers.Contract(permissionsRegistry.address, PermissionsRegistryV2TestABI, highlight); 
            expect(await permissionsRegistryV2.version()).to.equal("v2Test"); 
        })

        it("Proxy admin owner can transfer ownership, and the new owner can upgrade the PermissionsRegistry contract", async function () {
            let proxyAdmin = new ethers.Contract(await factory.proxyAdmin(), ProxyAdminABI, highlight);
            await expect(proxyAdmin.upgrade(permissionsRegistry.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            proxyAdmin = proxyAdmin.connect(proxyAdminOwner);
            await expect(proxyAdmin.transferOwnership(highlight.address))
                
            await expect(proxyAdmin.upgrade(permissionsRegistry.address, newImplementation.address))
                .to.be.revertedWith("Ownable: caller is not the owner")

            proxyAdmin = proxyAdmin.connect(highlight);
            await expect(proxyAdmin.upgrade(permissionsRegistry.address, newImplementation.address))
        })
    })
});