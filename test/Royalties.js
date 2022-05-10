const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    factorySetupCommunity,
    factoryDeployCommunity,
    factorySetupCommunityWithRegisteredTM,
    DEFAULT_ADMIN_ROLE,
    OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS,
    getUserDefinedNonce
} = require("../utils/test-utils");

const SplitMain = require("../artifacts/contracts/royalties/SplitMain.sol/SplitMain.json");
const SplitMainABI = SplitMain["abi"]

describe("Royalties", function () {
    let CommunityFactory;
    let factory;

    let CommunityReadManager;
    let MockERC20;
    let MinimalForwarder;
    let beacon;
    let splitMain;
    let mockERC20;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let addrs;
    let basicTm;

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

    describe("Split management", function () {
        let bareDeployedCommunity;
        let fullySetupCommunity;

        describe("Creating split", function () {
            beforeEach(async function () {
                const { deployedCommunity } = await factoryDeployCommunity(highlight, factory, beacon, highlight.address, creatorA.address, highlight.address, "Test");
                bareDeployedCommunity = deployedCommunity

                const { deployedCommunity: setupCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
                fullySetupCommunity = setupCommunity
            })

            it("Default admin should be able to set royalty split when its not set yet", async function () {
                await bareDeployedCommunity.setRoyaltySplit(
                    await factory.splitMain(),
                    [fanA.address, creatorA.address],
                    300000,
                    [350000, 350000],
                    0,
                    highlight.address,
                    [highlight.address, creatorA.address],
                    1000
               )
               expect(await splitMain.getSplit(await bareDeployedCommunity.royaltySplit())).to.eql([
                1,
                300000,
                0,
                [ 350000, 350000 ],
                highlight.address,
                [highlight.address, creatorA.address],
                [
                  fanA.address,
                  creatorA.address
                ]
               ])
            })

            it("Default admin should not be able to set royalty split after its set", async function () {
                expect(await fullySetupCommunity.royaltySplit()).to.not.equal("0x0000000000000000000000000000000000000000");
                await expect(fullySetupCommunity.setRoyaltySplit(
                    await factory.splitMain(),
                    [fanA.address, creatorA.address],
                    300000,
                    [350000, 350000],
                    0,
                    highlight.address,
                    [highlight.address, creatorA.address],
                    1000
               )).to.be.revertedWith("Already set")
            })

            it("Non Default admin should not be able to set royalty split", async function () {
                bareDeployedCommunity = bareDeployedCommunity.connect(creatorA.address)
                await expect(bareDeployedCommunity.setRoyaltySplit(
                    await factory.splitMain(),
                    [fanA.address, creatorA.address],
                    300000,
                    [350000, 350000],
                    0,
                    highlight.address,
                    [highlight.address, creatorA.address],
                    1000
               )).to.be.revertedWith(`AccessControl: account ${creatorA.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`)
            })

            describe("Creating royalty split with invalid inputs", function () {
                it("Royalty cut too high", async function () {
                    await expect(bareDeployedCommunity.setRoyaltySplit(
                        await factory.splitMain(),
                        [fanA.address, creatorA.address],
                        300000,
                        [350000, 350000],
                        0,
                        highlight.address,
                        [highlight.address, creatorA.address],
                        10001
                   )).to.be.revertedWith("Cut too big")
                })

                it("Too few secondary allocations", async function () {
                    await expect(bareDeployedCommunity.setRoyaltySplit(
                        await factory.splitMain(),
                        [],
                        300000,
                        [],
                        0,
                        highlight.address,
                        [highlight.address, creatorA.address],
                        1000
                   )).to.be.revertedWith("reverted with custom error 'InvalidSplit__TooFewAccounts(0)")
                })

                it("Secondary allocation and accounts array length mismatch", async function () {
                    await expect(bareDeployedCommunity.setRoyaltySplit(
                        await factory.splitMain(),
                        [fanA.address, creatorA.address],
                        30000,
                        [350000, 350000, 270000],
                        0,
                        highlight.address,
                        [highlight.address, creatorA.address],
                        1000
                   )).to.be.revertedWith("reverted with custom error 'InvalidSplit__AccountsAndAllocationsMismatch(2, 3)'")
                })

                it("Invalid distributor fee", async function () {
                    await expect(bareDeployedCommunity.setRoyaltySplit(
                        await factory.splitMain(),
                        [fanA.address, creatorA.address],
                        300000,
                        [350000, 350000],
                        100001,
                        highlight.address,
                        [highlight.address, creatorA.address],
                        1000
                   )).to.be.revertedWith("reverted with custom error 'InvalidSplit__InvalidDistributorFee(100001)'")
                })

                it("Invalid sum of all allocations", async function () {
                    await expect(bareDeployedCommunity.setRoyaltySplit(
                        await factory.splitMain(),
                        [fanA.address, creatorA.address],
                        300000,
                        [35000, 350000],
                        0,
                        highlight.address,
                        [highlight.address, creatorA.address],
                        1000
                   )).to.be.revertedWith("reverted with custom error 'InvalidSplit__InvalidAllocationsSum(685000)'")
                })
            })
        })

        describe("Predicting addresses", function () {
            it("Should be able to predict royalty split address with SplitMain", async function () {
                const { deployedCommunity } = await factoryDeployCommunity(highlight, factory, beacon, highlight.address, creatorA.address, highlight.address, "Test");

                const expectedSplitAddress = await splitMain.predictSplitAddress(
                    defaultSplit,
                    deployedCommunity.address
                )

                await deployedCommunity.setRoyaltySplit(
                    await factory.splitMain(),
                    [fanA.address, creatorA.address],
                    300000,
                    [350000, 350000],
                    0,
                    highlight.address,
                    [highlight.address, creatorA.address],
                    1000
               );

               expect(await deployedCommunity.royaltySplit()).to.equal(expectedSplitAddress);
            })

            it("Should be able to predict community address correctly with factory instantiation", async function () {
                let expectedCommunityAddress = await factory.predictDeployedCommunityAddress(
                    beacon.address,
                    creatorA.address,
                    highlight.address,
                    highlight.address,
                    "Test",
                    getUserDefinedNonce()
                )

                const { deployedCommunity } = await factoryDeployCommunity(highlight, factory, beacon, highlight.address, creatorA.address, highlight.address, "Test");

                expect(deployedCommunity.address).to.equal(expectedCommunityAddress.toLowerCase());

                expectedCommunityAddress = await factory.predictSetupCommunityAddress(
                    beacon.address,
                    creatorA.address,
                    highlight.address,
                    "Test",
                    getUserDefinedNonce()
                )

                const { deployedCommunity: deployedCommunity2 } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, addrs[0], "Test", "Test uri");

                expect(deployedCommunity2.address).to.equal(expectedCommunityAddress.toLowerCase());
            })

            it("Should not be able to predict community address with differing inputs", async function () {
                let expectedCommunityAddress = await factory.predictDeployedCommunityAddress(
                    beacon.address,
                    fanA.address,
                    highlight.address,
                    highlight.address,
                    "Test",
                    getUserDefinedNonce()
                )

                const { deployedCommunity } = await factoryDeployCommunity(highlight, factory, beacon, highlight.address, creatorA.address, highlight.address, "Test");
                
                expect(deployedCommunity.address).not.to.equal(expectedCommunityAddress.toLowerCase());

                expectedCommunityAddress = await factory.predictDeployedCommunityAddress(
                    beacon.address,
                    creatorA.address,
                    highlight.address,
                    highlight.address,
                    "Test",
                    getUserDefinedNonce() + 1
                )

                const { deployedCommunity: deployedCommunity2 } = await factoryDeployCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, "Test");

                expect(deployedCommunity2.address).not.to.equal(expectedCommunityAddress.toLowerCase());

                expectedCommunityAddress = await factory.predictDeployedCommunityAddress(
                    beacon.address,
                    creatorA.address,
                    highlight.address,
                    highlight.address,
                    "Test,",
                    getUserDefinedNonce()
                )

                const { deployedCommunity: deployedCommunity3 } = await factoryDeployCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, "Test");

                expect(deployedCommunity3.address).not.to.equal(expectedCommunityAddress.toLowerCase());
            })

            it("Should be able to predict royalty split address correctly with factory instantiation", async function () {
                let expectedRoyaltySplitAddress = await factory.predictRoyaltySplitAddress(
                    beacon.address,
                    creatorA.address,
                    highlight.address,
                    highlight.address,
                    addrs[0].address,
                    "Test",
                    getUserDefinedNonce()
                )
                
                const { deployedCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, addrs[0], "Test", "Test uri");
            
                expect(await deployedCommunity.royaltySplit()).to.equal(expectedRoyaltySplitAddress);
            })
        })

        describe("Updating split", function () {
            let split;
            beforeEach(async function () {
                const { deployedCommunity: setupCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
                fullySetupCommunity = setupCommunity

                split = await fullySetupCommunity.royaltySplit()

                splitMain = splitMain.connect(highlightBeaconAdmin)
            })

            it("Primary controller should be able to update entire split", async function () {
                await expect(splitMain.updateSplit(
                    split, 
                    { ...defaultSplit, primaryAllocation: 400000, secondaryAllocations: [500000, 100000] } 
                )).to.emit(splitMain, "UpdateSplit").withArgs(split);
            })

            it("Should not be able to update split to invalid values", async function () {
                await expect(splitMain.updateSplit(
                    split, 
                    { ...defaultSplit, primaryAllocation: 400000, secondaryAllocations: [600000, 100000] } 
                )).to.be.revertedWith("reverted with custom error 'InvalidSplit__InvalidAllocationsSum(1100000)'")
            })

            it("Changed controllers in updateSplit should not actually modify the controllers on the split", async function () {
                const updatedSplit = { ...defaultSplit, primaryController: fanA.address, secondaryControllers: [fanA.address] } 
                await expect(splitMain.updateSplit(
                    split, 
                    updatedSplit
                )).to.emit(splitMain, "UpdateSplit").withArgs(split);

                // even if controller is different in struct, they are unchanged through update
                expect((await splitMain.getSplit(split)).primaryController).to.not.equal(updatedSplit.primaryController);
                expect((await splitMain.getSplit(split)).secondaryControllers).to.not.equal(updatedSplit.secondaryControllers);
            })

            it("Secondary controller should be able to update secondary split", async function () {
                splitMain = splitMain.connect(creatorA)
                await expect(splitMain.updateSplit(
                    split, 
                    { ...defaultSplit, secondaryAllocations: [500000, 200000] } 
                )).to.emit(splitMain, "UpdateSplit").withArgs(split);
            })

            it("Secondary controller should not be able to update entire split", async function () {
                splitMain = splitMain.connect(creatorA)
                await expect(splitMain.updateSplit(
                    split, 
                    { ...defaultSplit, primaryAllocation: 400000, secondaryAllocations: [500000, 100000] } 
                )).to.be.revertedWith(`'Unauthorized("${creatorA.address}")'`)
            })

            it("Non controller should not be able to update any of a split", async function () {
                splitMain = splitMain.connect(fanA)
                await expect(splitMain.updateSplit(
                    split, 
                    { ...defaultSplit, primaryAllocations: 400000, secondaryAllocations: [500000, 200000] } 
                )).to.be.revertedWith(`'Unauthorized("${fanA.address}")'`)
            })
        })

        describe("Transfer split controller ownership", function () {
            let split;
            beforeEach(async function () {
                const { deployedCommunity: setupCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, addrs[0], "Test", "Test uri");
                fullySetupCommunity = setupCommunity

                split = await fullySetupCommunity.royaltySplit()
                splitMain = splitMain.connect(highlight)
            })

            it("Primary controller should be able to grant primary controller", async function () {
                await expect(splitMain.grantPrimaryController(split, creatorA.address))
                    .to.emit(splitMain, "NewPrimaryController")
                    .withArgs(split, highlight.address, creatorA.address)
                
                expect((await splitMain.getSplit(split)).primaryController).to.equal(creatorA.address);
            })

            it("Secondary controller should be able to grant secondary controller", async function () {
                splitMain = splitMain.connect(creatorA)
                await expect(splitMain.grantSecondaryController(split, fanA.address))
                    .to.emit(splitMain, "NewSecondaryController")
                    .withArgs(split, fanA.address)
                
                expect((await splitMain.getSplit(split)).secondaryControllers).to.eql([addrs[0].address, creatorA.address, fanA.address]);
            })

            it("Primary controller should be able to renounce primary controller", async function () {
                await expect(splitMain.renouncePrimaryController(split))
                    .to.emit(splitMain, "NewPrimaryController")
                    .withArgs(split, highlight.address, ethers.constants.AddressZero)
                
                expect((await splitMain.getSplit(split)).primaryController).to.equal(ethers.constants.AddressZero);
            })

            it("Secondary controller should be able to revoke a secondary controller", async function () {
                splitMain = splitMain.connect(creatorA)

                await expect(splitMain.grantSecondaryController(split, fanA.address))
                    .to.emit(splitMain, "NewSecondaryController")
                    .withArgs(split, fanA.address)

                expect((await splitMain.getSplit(split)).secondaryControllers).to.eql([addrs[0].address, creatorA.address, fanA.address]);

                await expect(splitMain.revokeSecondaryController(split, fanA.address))
                    .to.emit(splitMain, "SecondaryControllerRemoved")
                    .withArgs(split, fanA.address)
                
                expect((await splitMain.getSplit(split)).secondaryControllers).to.eql([addrs[0].address, creatorA.address]);

                await expect(splitMain.revokeSecondaryController(split, creatorA.address))
                    .to.emit(splitMain, "SecondaryControllerRemoved")
                    .withArgs(split, creatorA.address)
                
                expect((await splitMain.getSplit(split)).secondaryControllers).to.eql([addrs[0].address]);

                await expect(splitMain.revokeSecondaryController(split, highlight.address))
                    .to.be.revertedWith(`'Unauthorized("${creatorA.address}")'`)

                splitMain = splitMain.connect(addrs[0])

                await expect(splitMain.revokeSecondaryController(split, addrs[0].address))
                    .to.emit(splitMain, "SecondaryControllerRemoved")
                    .withArgs(split, addrs[0].address)
                
                expect((await splitMain.getSplit(split)).secondaryControllers).to.eql([]);
            })

            it("Secondary controller should not be able to grant secondary controller to an already secondary controller", async function () {
                splitMain = splitMain.connect(addrs[0])
                await expect(splitMain.grantSecondaryController(split, creatorA.address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${creatorA.address}")'`)

                await expect(splitMain.grantSecondaryController(split, addrs[0].address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${addrs[0].address}")'`)

                splitMain = splitMain.connect(creatorA);

                await expect(splitMain.grantSecondaryController(split, creatorA.address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${creatorA.address}")'`)

                await expect(splitMain.grantSecondaryController(split, addrs[0].address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${addrs[0].address}")'`)

                await expect(splitMain.grantSecondaryController(split, fanA.address))
                    .to.emit(splitMain, "NewSecondaryController")
                    .withArgs(split, fanA.address)

                await expect(splitMain.grantSecondaryController(split, fanA.address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${fanA.address}")'`)

                await expect(splitMain.grantSecondaryController(split, addrs[0].address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${addrs[0].address}")'`)

                splitMain = splitMain.connect(fanA);

                await expect(splitMain.grantSecondaryController(split, creatorA.address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${creatorA.address}")'`)

                await expect(splitMain.grantSecondaryController(split, addrs[0].address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${addrs[0].address}")'`)

                await expect(splitMain.grantSecondaryController(split, fanA.address))
                    .to.be.revertedWith(`'InvalidNewSecondaryController("${fanA.address}")'`)
            })

            it("Secondary controller should not be able to remove secondary controller from an account that is not already a secondary controller", async function () {
                splitMain = splitMain.connect(addrs[0])
                
                await expect(splitMain.revokeSecondaryController(split, fanA.address))
                    .to.be.revertedWith(`'InvalidRemovedSecondaryController("${fanA.address}")'`)

                splitMain = splitMain.connect(creatorA);

                await expect(splitMain.revokeSecondaryController(split, fanA.address))
                    .to.be.revertedWith(`'InvalidRemovedSecondaryController("${fanA.address}")'`)

                await splitMain.grantSecondaryController(split, fanA.address)

                splitMain = splitMain.connect(fanA);

                await splitMain.revokeSecondaryController(split, addrs[0].address)
                
                splitMain = splitMain.connect(creatorA);

                await expect(splitMain.revokeSecondaryController(split, highlight.address))
                    .to.be.revertedWith(`'InvalidRemovedSecondaryController("${highlight.address}")'`)

                await expect(splitMain.revokeSecondaryController(split, addrs[0].address))
                    .to.be.revertedWith(`'InvalidRemovedSecondaryController("${addrs[0].address}")'`)
                    
            })

            it("Non-primary controller should not be able to grant primary controller", async function () {
                splitMain = splitMain.connect(creatorA)
                await expect(splitMain.grantPrimaryController(split, creatorA.address))
                    .to.be.revertedWith(`'Unauthorized("${creatorA.address}")'`)

                splitMain = splitMain.connect(fanA)
                await expect(splitMain.grantPrimaryController(split, fanA.address))
                    .to.be.revertedWith(`'Unauthorized("${fanA.address}")'`)
            })

            it("Non-Secondary controller should not be able to grant secondary controller", async function () {
                splitMain = splitMain.connect(fanA)
                await expect(splitMain.grantSecondaryController(split, fanA.address))
                    .to.be.revertedWith(`'Unauthorized("${fanA.address}")'`)

                splitMain = splitMain.connect(highlight)
                await expect(splitMain.grantSecondaryController(split, highlight.address))
                    .to.be.revertedWith(`'Unauthorized("${highlight.address}")'`)
            })

            it("Non-Primary controller should not be able to renounce primary controller", async function () {
                splitMain = splitMain.connect(creatorA)
                await expect(splitMain.renouncePrimaryController(split))
                    .to.be.revertedWith(`'Unauthorized("${creatorA.address}")'`)

                splitMain = splitMain.connect(fanA)
                await expect(splitMain.renouncePrimaryController(split))
                    .to.be.revertedWith(`'Unauthorized("${fanA.address}")'`)
            })

            it("Non-Secondary controller should not be able to revoke a secondary controller", async function () {
                splitMain = splitMain.connect(fanA)
                await expect(splitMain.revokeSecondaryController(split, creatorA.address))
                    .to.be.revertedWith(`'Unauthorized("${fanA.address}")'`)

                splitMain = splitMain.connect(highlight)
                await expect(splitMain.revokeSecondaryController(split, creatorA.address))
                    .to.be.revertedWith(`'Unauthorized("${highlight.address}")'`)
            })
        })
    })

    describe("Flow of royalty funds", function () {
        let split;
        beforeEach(async function () {
            const { deployedCommunity: setupCommunity } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, addrs[0], "Test", "Test uri");
            fullySetupCommunity = setupCommunity

            split = await fullySetupCommunity.royaltySplit()
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
        })

        it("Anyone can distribute ETH for a split", async function () {
            splitMain = splitMain.connect(highlightBeaconAdmin);
            
            await expect(splitMain.distributeETH(split, highlightBeaconAdmin.address))
                .to.emit(splitMain, "DistributeETH")
                .withArgs(split, ethers.utils.parseEther("1.0"), highlightBeaconAdmin.address)

            expect(await splitMain.getETHBalance(highlight.address)).to.equal(ethers.utils.parseEther("0.3"))
            expect(await splitMain.getETHBalance(creatorA.address)).to.equal(ethers.utils.parseEther("0.7"))
            expect(await splitMain.getETHBalance(split)).to.equal(ethers.utils.parseEther("0.0"))
        })

        it("Anyone can distribute ERC20 for a split", async function () {
            splitMain = splitMain.connect(highlightBeaconAdmin);
            
            await expect(splitMain.distributeERC20(split, mockERC20.address, highlightBeaconAdmin.address))
                .to.emit(splitMain, "DistributeERC20")
                .withArgs(split, mockERC20.address, 99, highlightBeaconAdmin.address)

            expect(await splitMain.getERC20Balance(highlight.address, mockERC20.address)).to.equal(29)
            expect(await splitMain.getERC20Balance(creatorA.address, mockERC20.address)).to.equal(69)
            expect(await splitMain.getERC20Balance(split, mockERC20.address)).to.equal(1)
        })

        describe("Withdraw", function () {
            before(async function () {
                // clear out balances
                tx = await splitMain.withdraw(highlight.address, 1, [mockERC20.address])
                await tx.wait()
            })

            beforeEach(async function () {     
                let tx = await splitMain.distributeETH(split, highlightBeaconAdmin.address)
                await tx.wait()
                tx = await splitMain.distributeERC20(split, mockERC20.address, highlightBeaconAdmin.address)
                await tx.wait()
            })
    
            it("Anyone can withdraw amounts on behalf of another account as a result of one split being distributed", async function () {
                const initialEthBalance = await highlight.getBalance()
                const initialMockERC20Balance = await mockERC20.balanceOf(highlight.address)

                tx = await splitMain.withdraw(highlight.address, 1, [mockERC20.address])
                await tx.wait()

                const finalEthBalance = await highlight.getBalance()
                const finalMockERC20Balance = await mockERC20.balanceOf(highlight.address)

                // required due to gas consumption
                const expectedETHBalanceDifference = ethers.BigNumber.from(
                        ethers.utils.parseEther("0.3")
                    ).sub(
                        finalEthBalance.sub(initialEthBalance)
                    )

                expect(ethers.utils.formatEther(expectedETHBalanceDifference).slice(0, 6)).to.equal("0.0000")
                expect(finalMockERC20Balance.sub(initialMockERC20Balance).toString()).to.equal("29");
            })
        })
    })

    describe("Royalty cut modification", function () {
        it("Only default admin can modify royalty cut", async function () {
            await expect(fullySetupCommunity.setRoyaltyCut(2000))
                .to.emit(fullySetupCommunity, "RoyaltyCutSet")
                .withArgs(1000, 2000);
        })

        it("Cannot directly set royalty cut that's too big", async function () {
            await expect(fullySetupCommunity.setRoyaltyCut(10001))
                .to.be.revertedWith("Cut too big")
        })

        it("Non default admin cannot modify royalty cut", async function () {
            fullySetupCommunity = fullySetupCommunity.connect(creatorA.address)
            await expect(fullySetupCommunity.setRoyaltyCut(10001))
                .to.be.revertedWith("Unauthorized")
        })
    })

    describe("Marketplace", function () {
        describe("Mock Marketplace", function () {
            it("2981 is exposed correctly after royalty cut change", async function () {
                fullySetupCommunity = fullySetupCommunity.connect(highlight)
                await expect(fullySetupCommunity.setRoyaltyCut(1000))
                    .to.emit(fullySetupCommunity, "RoyaltyCutSet")
                    .withArgs(2000, 1000);

                expect(await fullySetupCommunity.royaltyInfo(1, 1000)).to.eql([await fullySetupCommunity.royaltySplit(), ethers.BigNumber.from(100)])
            })
        })

        describe("External marketplace", function () {
            let approveTrueBytes;
            let approveFalseBytes;

            before(async function () {
                const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlight.address, highlight.address, addrs[0], "Test", "Test uri");
                fullySetupCommunity = deployedCommunity
                basicTm = deployedBasicTm
                
                let tx = await basicTm.mintNewTokenToMultiple([highlight.address], [100], "", true);
                await tx.wait()

                tx = await fullySetupCommunity.safeTransferFrom(highlight.address, creatorA.address, 1, 5, ethers.utils.arrayify("0x"))
                await tx.wait();

                tx = await fullySetupCommunity.safeTransferFrom(highlight.address, fanA.address, 1, 1, ethers.utils.arrayify("0x"))
                await tx.wait();

                approveTrueBytes = ethers.utils.AbiCoder.prototype.encode(['bool'], [true]);
                approveFalseBytes = ethers.utils.AbiCoder.prototype.encode(['bool'], [false]);
            })

            it("Can transfer 'ownership' of contract", async function () {
                expect(await fullySetupCommunity.owner()).to.equal(highlight.address);

                await expect(fullySetupCommunity.transferOwnership(creatorA.address))
                    .to.emit(fullySetupCommunity, "OwnershipTransferred")
                    .withArgs(highlight.address, creatorA.address)

                expect(await fullySetupCommunity.owner()).to.equal(creatorA.address);
            })

            it("Platform admin can approve OpenSea for the recipient on batch airdrop", async function () {
                expect(await fullySetupCommunity.isApprovedForAll(highlightBeaconAdmin.address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(false)
                fullySetupCommunity = fullySetupCommunity.connect(highlight)
                let tx = await fullySetupCommunity.safeBatchTransferFrom(highlight.address, highlightBeaconAdmin.address, [1], [1], approveTrueBytes)
                await tx.wait() 

                expect(await fullySetupCommunity.isApprovedForAll(highlightBeaconAdmin.address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(true)

                expect(await fullySetupCommunity.isApprovedForAll(addrs[0].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(false)
                fullySetupCommunity = fullySetupCommunity.connect(creatorA)
                tx = await fullySetupCommunity.safeBatchTransferFrom(creatorA.address, addrs[0].address, [1], [1], approveTrueBytes)
                await tx.wait()

                expect(await fullySetupCommunity.isApprovedForAll(addrs[0].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(true)
            })

            it("Passing in empty bytes should not approve Opensea on airdrop", async function () {
                fullySetupCommunity = fullySetupCommunity.connect(highlight)
                let tx = await fullySetupCommunity.safeTransferFrom(highlight.address, addrs[1].address, 1, 1, ethers.utils.arrayify("0x"))
                await tx.wait() 

                expect(await fullySetupCommunity.isApprovedForAll(addrs[1].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(false)

                tx = await fullySetupCommunity.safeBatchTransferFrom(highlight.address, addrs[1].address, [1], [1], ethers.utils.arrayify("0x"))
                await tx.wait() 

                expect(await fullySetupCommunity.isApprovedForAll(addrs[1].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(false)
            })

            it("Passing in false flag should not approve Opensea on airdrop", async function () {
                let tx = await fullySetupCommunity.safeTransferFrom(highlight.address, addrs[1].address, 1, 1, approveFalseBytes)
                await tx.wait() 

                expect(await fullySetupCommunity.isApprovedForAll(addrs[1].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(false)

                tx = await fullySetupCommunity.safeBatchTransferFrom(highlight.address, addrs[1].address, [1], [1], approveFalseBytes)
                await tx.wait() 

                expect(await fullySetupCommunity.isApprovedForAll(addrs[1].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(false)
            })

            it("Non platform admin cannot approve OpenSea on transfer", async function () {
                fullySetupCommunity = fullySetupCommunity.connect(fanA)
                let tx = await fullySetupCommunity.safeTransferFrom(fanA.address, addrs[1].address, 1, 1, approveTrueBytes)
                await tx.wait() 

                expect(await fullySetupCommunity.isApprovedForAll(addrs[1].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(false)
            })

            it("User can unapprove OpenSea after approved airdrop", async function () {
                fullySetupCommunity = fullySetupCommunity.connect(highlight)
                let tx = await fullySetupCommunity.safeBatchTransferFrom(highlight.address, addrs[1].address, [1], [1], approveTrueBytes)
                await tx.wait() 

                expect(await fullySetupCommunity.isApprovedForAll(addrs[1].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(true)

                fullySetupCommunity = fullySetupCommunity.connect(addrs[1])
                tx = await fullySetupCommunity.setApprovalForAll(OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS, false)
                await tx.wait()

                expect(await fullySetupCommunity.isApprovedForAll(addrs[1].address, OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS)).to.equal(false)
            })
        })
    })
});