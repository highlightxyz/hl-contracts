const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    factorySetupCommunityWithRegisteredTM, 
    arrayToNum,
    deployCommunityFactory2,
    deployGlobalBasicTokenManager
} = require("../utils/test-utils");

describe("Mint", function () {
    let CommunityFactory;
    let factory;

    let Beacon;
    let BasicCommunityV1Impl;
    let TransferHooksTokenManager;
    let MinimalForwarder;
    let APIProxy;
    let community;
    let beacon;
    let basicTm;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let addrs;
    let api;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon"); 
        TransferHooksTokenManager = await ethers.getContractFactory("TransferHooksTokenManager2");
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
        APIProxy = await ethers.getContractFactory("APIProxy");

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
        api = await APIProxy.deploy(await factory.splitMain())
        await api.deployed();
    }); 
    
    describe("BasicTokenManager", function () {
        describe("Minting new tokens", function () {
            beforeEach(async function () {
                const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
                community = deployedCommunity
                basicTm = deployedBasicTm
            });
    
            describe("One recipient", function () {
                it("Minting new membership token to highlight should succeed", async function () {
                    await expect(basicTm.mintNewTokensToOne(highlight.address, [10], ["uri"], [true]))
                        .to.emit(community, "TransferSingle")
                        .to.emit(basicTm, "MintedNewTokensToOne")
                
                    expect(await community.balanceOf(highlight.address, 1)).to.equal(10);
                    expect((await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(10);
                    expect(await community.uri(1)).to.equal("uri");
                });
                
                it("Minting new membership token to highlight with no uri should succeed", async function () {
                    await expect(basicTm.mintNewTokensToOne(highlight.address, [10], [], [true]))
                        .to.emit(community, "TransferSingle")
                        .to.emit(basicTm, "MintedNewTokensToOne")
                
                    expect(await community.balanceOf(highlight.address, 1)).to.equal(10);
                    expect((await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(10);
                    expect(await community.uri(1)).to.equal("");
                });
    
                it("Minting new benefit token to highlight should succeed", async function () {
                    await expect(basicTm.mintNewTokensToOne(highlight.address, [100], [""], [false]))
                        .to.emit(community, "TransferSingle")
                        .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", highlight.address, 101, 100)
                        .to.emit(basicTm, "MintedNewTokensToOne")
                
                    expect(await community.balanceOf(highlight.address, 101)).to.equal(100);
                    expect((await api.totalSupplyBatch(community.address, [101]))[0]).to.equal(100);
                });
                
                it("Minting new tokens to highlight should succeed", async function () {
                    const ids = [1, 2, 101, 102, 3];
                    const amounts = [10, 19, 150, 2000, 2]
                    const uris = ["uri 1", "uri 2", "uri 3", "uri 4", "uri 5"]
                
                    await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, uris, [true, true, false, false, true]))
                        .to.emit(community, "TransferBatch")
                        .to.emit(basicTm, "MintedNewTokensToOne")
                
                    const accounts = [];
                    const tokenManagers = [];
                    for (let i = 0; i < 5; i++) {
                        accounts.push(highlight.address);
                        tokenManagers.push(ethers.utils.getAddress(basicTm.address));
                    }
                    expect(arrayToNum(await community.balanceOfBatch(accounts, ids))).to.eql(amounts);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, ids))).to.eql(amounts);
                    expect(await api.uriBatch(community.address, ids)).to.eql(uris);
                    expect(await community.tokenManagerBatch(ids)).to.eql(tokenManagers);
                });
    
                it("Minting new tokens to one recipient with invalid inputs should all fail", async function () {
                    await expect(basicTm.mintNewTokensToOne(fanA.address, [], [], [true]))
                        .to.be.revertedWith("Empty array")
                
                    await expect(basicTm.mintNewTokensToOne(fanA.address, [1], [], []))
                        .to.be.revertedWith("Empty array")
                
                    await expect(basicTm.mintNewTokensToOne(fanA.address, [10, 20], [], [true]))
                        .to.be.revertedWith("Invalid input")
                
                    await expect(basicTm.mintNewTokensToOne(fanA.address, [10], [], [true, false]))
                        .to.be.revertedWith("Invalid input")
                
                    await expect(basicTm.mintNewTokensToOne(fanA.address, [10], ["uri 1", "uri 2"], [true, false]))
                        .to.be.revertedWith("Invalid input")
                });
            });
    
            describe("Multiple recipients", function () {
                it("Minting new token to multiple recipients with various amounts should succeed", async function () {
                    const recipients = [creatorA.address, fanA.address, addrs[0].address, addrs[1].address];
                    const amounts = [10, 19, 150, 2000]
    
                    await expect(basicTm.mintNewTokenToMultiple(recipients, amounts, "uri", true))
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
                });
                
                it("Minting new token to multiple recipients with one amount should succeed", async function () {
                    const recipients = [creatorA.address, fanA.address, addrs[0].address, addrs[1].address];
    
                    await expect(basicTm.mintNewTokenToMultiple(recipients, [5], "uri", true))
                        .to.emit(community, "TransferSingle")
                        .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", creatorA.address, 1, 5)
                        .to.emit(community, "TransferSingle")
                        .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", fanA.address, 1, 5)
                        .to.emit(community, "TransferSingle")
                        .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", addrs[0].address, 1, 5)
                        .to.emit(community, "TransferSingle")
                        .withArgs(ethers.utils.getAddress(basicTm.address), "0x0000000000000000000000000000000000000000", addrs[1].address, 1, 5)
    
                    const ids = [1, 1, 1, 1];
                    const amounts = [5, 5, 5, 5]
    
                    expect(arrayToNum(await community.balanceOfBatch(recipients, ids))).to.eql(amounts);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(20);
                    expect(await community.uri(1)).to.equal("uri");
                    expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(basicTm.address));
                });
    
                it("Minting new token to multiple recipients with invalid inputs should all fail", async function () {
                    await expect(basicTm.mintNewTokenToMultiple([], [10], "uri", true))
                        .to.be.revertedWith("Empty array")
    
                    await expect(basicTm.mintNewTokenToMultiple([fanA.address], [], "uri", true))
                        .to.be.revertedWith("Empty array")
    
                    await expect(basicTm.mintNewTokenToMultiple([creatorA.address, fanA.address, addrs[0].address], [10, 12], "uri", true))
                        .to.be.revertedWith("Invalid input")
                });
            })
        });
    
        describe("Minting existing tokens", function () {
            beforeEach(async function () {
                const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
                community = deployedCommunity
                basicTm = deployedBasicTm
    
                tx = await basicTm.mintNewTokensToOne(highlight.address, [100, 100, 100], [], [true, false, true]);
                await tx.wait();
    
                tx = await basicTm.mintNewTokenToMultiple([creatorA.address, fanA.address], [50, 200], "uri 4", false);
                await tx.wait();
    
                /*
                    Balance state:
                    {
                        1: {
                            highlight: 100
                        },
                        101: {
                            highlight: 100
                        },
                        2: {
                            highlight: 100
                        }, 
                        102: {
                            creatorA: 50,
                            fanA: 200
                        }
                    }
                */
            }); 

            /* With current set of token managers, minting existing tokens is deprecated. Commenting out as other token managers may enable this functionality */
    
            /*
            describe("One recipient", function () {
                it("Minting existing token to one recipient should work", async function () {
                    await basicTm.mintExistingTokens([creatorA.address], [2], [90])
                    
                    expect(await community.balanceOf(creatorA.address, 2)).to.equal(90);
                    expect((await api.totalSupplyBatch(community.address, [2]))[0]).to.equal(190);
                });
        
                it("Minting existing tokens to one recipient should work", async function() {
                    await basicTm.mintExistingTokens([creatorA.address], [2, 102], [90, 100])
                    
                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, creatorA.address], [2, 102]))).to.eql([90, 150]);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, [2, 102]))).to.eql([190, 350]);
                });
            })
    
            describe("Multiple recipients", function () {
                it("Minting existing token to multiple recipients (same amounts) should work", async function () {
                    await basicTm.mintExistingTokens([creatorA.address, fanA.address, addrs[0].address], [2], [90])
                    
                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, fanA.address, addrs[0].address], [2, 2, 2]))).to.eql([90, 90, 90]);
                    expect((await api.totalSupplyBatch(community.address, [2]))[0]).to.equal(370);
                });
        
                it("Minting existing token to multiple recipients (different amounts) should work", async function () {
                    await basicTm.mintExistingTokens([creatorA.address, fanA.address, addrs[0].address], [102], [90, 85, 20])
                    
                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, fanA.address, addrs[0].address], [102, 102, 102]))).to.eql([140, 285, 20]);
                    expect((await api.totalSupplyBatch(community.address, [102]))[0]).to.equal(445);
                });
    
                it("Minting existing tokens to multiple recipients (different amounts) should work", async function () {
                    await basicTm.mintExistingTokens([creatorA.address, fanA.address, addrs[0].address], [2, 101, 2], [90, 85, 20])
                    
                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, fanA.address, addrs[0].address], [2, 101, 2]))).to.eql([90, 85, 20]);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, [2, 101]))).to.eql([210, 185]);
                });
            })

            describe("Mint existing minimized", function () {
                it("Minting existing token to multiple recipients with minimized mint should work", async function () {
                    await community.mintExistingMinimized([creatorA.address, fanA.address, addrs[0].address], 2, 90, ethers.utils.arrayify("0x"))

                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, fanA.address, addrs[0].address], [2, 2, 2]))).to.eql([90, 90, 90]);
                    expect((await api.totalSupplyBatch(community.address, [2]))[0]).to.equal(370);
                })

                it("Minting existing token to multiple recipients with minimized mint should not work if total supply is 0", async function () {
                    await expect(community.mintExistingMinimized([creatorA.address, fanA.address, addrs[0].address], 4, 90, ethers.utils.arrayify("0x")))
                        .to.be.revertedWith("Cannot mint here")

                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, fanA.address, addrs[0].address], [2, 2, 2]))).to.eql([0, 0, 0]);
                    expect((await api.totalSupplyBatch(community.address, [2]))[0]).to.equal(100);
                })
            })
    
            it("Minting existing tokens with invalid inputs should all fail", async function () {
                await expect(basicTm.mintExistingTokens([creatorA.address], [1], [9, 10]))
                    .to.be.revertedWith("Invalid array");
    
                await expect(basicTm.mintExistingTokens([creatorA.address, fanA.address], [1, 2], [9, 10, 14]))
                    .to.be.revertedWith("Invalid input");
            });

            */
           /*

            describe("Mint existing no-ops", function () {
                it("Minting existing token on token manager should be a no-op", async function () {
                    await expect(basicTm.mintExistingTokens([creatorA.address], [2], [90]))
                        .to.be.revertedWith("no-op, reserved for interface");
                });

                it("Minting existing token minimized should be a no-op", async function () {
                    await expect(community.mintExistingMinimized([creatorA.address, fanA.address, addrs[0].address], 2, 90, ethers.utils.arrayify("0x")))
                        .to.be.revertedWith("no-op, reserved for interface");
                });
            })
            */
        });
    });
    
    describe("TransferHooksTokenManager", function () {
        describe("Minting new tokens", function () {
            beforeEach(async function () {
                const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
                community = deployedCommunity
                basicTm = deployedBasicTm
    
                transferHooksTm = await TransferHooksTokenManager.deploy(community.address);
                await transferHooksTm.deployed();
    
                let tx = await community.registerTokenManager(transferHooksTm.address);
                await tx.wait();
            });
    
            describe("One recipient", function () {
                it("Minting new membership token to highlight should succeed", async function () {
                    await expect(transferHooksTm.mintNewTokensToOne(highlight.address, [10], ["uri"], [true]))
                        .to.emit(community, "TransferSingle")
                        .to.emit(transferHooksTm, "MintedNewTokensToOne")
        
                    expect(await community.balanceOf(highlight.address, 1)).to.equal(10);
                    expect((await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(10);
                    expect(await community.uri(1)).to.equal("uri");
                });
        
                it("Minting new membership token to highlight with no uri should succeed", async function () {
                    await expect(transferHooksTm.mintNewTokensToOne(highlight.address, [10], [], [true]))
                        .to.emit(community, "TransferSingle")
                        .to.emit(transferHooksTm, "MintedNewTokensToOne")
        
                    expect(await community.balanceOf(highlight.address, 1)).to.equal(10);
                    expect((await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(10);
                    expect(await community.uri(1)).to.equal("");
                });
    
                it("Minting new benefit token to highlight should succeed", async function () {
                    await expect(transferHooksTm.mintNewTokensToOne(highlight.address, [100], [""], [false]))
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", highlight.address, 101, 100)
                        .to.emit(transferHooksTm, "MintedNewTokensToOne")
        
                    expect(await community.balanceOf(highlight.address, 101)).to.equal(100);
                    expect((await api.totalSupplyBatch(community.address, [101]))[0]).to.equal(100);
                    expect(await community.totalSupply(101)).to.equal(100);
                });
        
                it("Minting new tokens to highlight should succeed", async function () {
                    const ids = [1, 2, 101, 102, 3];
                    const amounts = [10, 19, 150, 2000, 2]
                    const uris = ["uri 1", "uri 2", "uri 3", "uri 4", "uri 5"]
        
                    await expect(transferHooksTm.mintNewTokensToOne(highlight.address, amounts, uris, [true, true, false, false, true]))
                        .to.emit(community, "TransferBatch")
                        .to.emit(transferHooksTm, "MintedNewTokensToOne")
        
                    const accounts = [];
                    const tokenManagers = [];
                    for (let i = 0; i < 5; i++) {
                        accounts.push(highlight.address);
                        tokenManagers.push(transferHooksTm.address);
                    }
                    expect(arrayToNum(await community.balanceOfBatch(accounts, ids))).to.eql(amounts);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, ids))).to.eql(amounts);
                    expect(await api.uriBatch(community.address, ids)).to.eql(uris);
                    expect(await community.tokenManagerBatch(ids)).to.eql(tokenManagers);
                });
        
                it("Minting new tokens to one recipient with invalid inputs should all fail", async function () {
                    await expect(transferHooksTm.mintNewTokensToOne(fanA.address, [], [], [true]))
                        .to.be.revertedWith("Empty array")
        
                    await expect(transferHooksTm.mintNewTokensToOne(fanA.address, [1], [], []))
                        .to.be.revertedWith("Empty array")
        
                    await expect(transferHooksTm.mintNewTokensToOne(fanA.address, [10, 20], [], [true]))
                        .to.be.revertedWith("Invalid input")
        
                    await expect(transferHooksTm.mintNewTokensToOne(fanA.address, [10], [], [true, false]))
                        .to.be.revertedWith("Invalid input")
        
                    await expect(transferHooksTm.mintNewTokensToOne(fanA.address, [10], ["uri 1", "uri 2"], [true, false]))
                        .to.be.revertedWith("Invalid input")
                });
            })
    
            describe("Multiple recipients", function () {
                it("Minting new token to multiple recipients with various amounts should succeed", async function () {
                    const recipients = [creatorA.address, fanA.address, addrs[0].address, addrs[1].address];
                    const amounts = [10, 19, 150, 2000]
        
                    await expect(transferHooksTm.mintNewTokenToMultiple(recipients, amounts, "uri", true))
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", creatorA.address, 1, amounts[0])
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", fanA.address, 1, amounts[1])
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", addrs[0].address, 1, amounts[2])
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", addrs[1].address, 1, amounts[3])
        
                    const ids = [1, 1, 1, 1];
        
                    expect(arrayToNum(await community.balanceOfBatch(recipients, ids))).to.eql(amounts);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(2179);
                    expect(await community.uri(1)).to.equal("uri");
                    expect((await community.tokenManagerBatch([1]))[0]).to.equal(transferHooksTm.address);
                });
    
                it("Minting new token to multiple recipients with one amount should succeed", async function () {
                    const recipients = [creatorA.address, fanA.address, addrs[0].address, addrs[1].address];
        
                    await expect(transferHooksTm.mintNewTokenToMultiple(recipients, [5], "uri", true))
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", creatorA.address, 1, 5)
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", fanA.address, 1, 5)
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", addrs[0].address, 1, 5)
                        .to.emit(community, "TransferSingle")
                        .withArgs(transferHooksTm.address, "0x0000000000000000000000000000000000000000", addrs[1].address, 1, 5)
        
                    const ids = [1, 1, 1, 1];
                    const amounts = [5, 5, 5, 5]
        
                    expect(arrayToNum(await community.balanceOfBatch(recipients, ids))).to.eql(amounts);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, [1]))[0]).to.equal(20);
                    expect(await community.uri(1)).to.equal("uri");
                    expect((await community.tokenManagerBatch([1]))[0]).to.equal(transferHooksTm.address);
                });
    
                it("Minting new token to multiple recipients with invalid inputs should all fail", async function () {
                    await expect(transferHooksTm.mintNewTokenToMultiple([], [10], "uri", true))
                        .to.be.revertedWith("Empty array")
        
                    await expect(transferHooksTm.mintNewTokenToMultiple([fanA.address], [], "uri", true))
                        .to.be.revertedWith("Empty array")
        
                    await expect(transferHooksTm.mintNewTokenToMultiple([creatorA.address, fanA.address, addrs[0].address], [10, 12], "uri", true))
                        .to.be.revertedWith("Invalid input")
                });
            })
        });
    
        describe("Minting existing tokens", function () {
            beforeEach(async function () {
                const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
                community = deployedCommunity
                basicTm = deployedBasicTm
    
                transferHooksTm = await TransferHooksTokenManager.deploy(community.address);
                await transferHooksTm.deployed();
    
                let tx = await community.registerTokenManager(transferHooksTm.address);
                await tx.wait();
    
                tx = await transferHooksTm.mintNewTokensToOne(highlight.address, [100, 100, 100], [], [true, false, true]);
                await tx.wait();
    
                tx = await transferHooksTm.mintNewTokenToMultiple([creatorA.address, fanA.address], [50, 200], "uri 4", false);
                await tx.wait();
    
                /*
                    Balance state:
                    {
                        1: {
                            highlight: 100
                        },
                        101: {
                            highlight: 100
                        },
                        2: {
                            highlight: 100
                        }, 
                        102: {
                            creatorA: 50,
                            fanA: 200
                        }
                    }
                */ 
            }); 

            /* With current set of token managers, minting existing tokens is deprecated. Commenting out as other token managers may enable this functionality */
    
            // due to setup above, await expect doesn't work as expected, so not ensuring events are emitted
            // error: TypeError: Cannot read properties of undefined (reading 'waitForTransaction')
            // TOOD: resolve this

            /*
            describe("One recipient", function () {
                it("Minting existing token to one recipient should work", async function () {
                    await transferHooksTm.mintExistingTokens([creatorA.address], [2], [90])
                    
                    expect(await community.balanceOf(creatorA.address, 2)).to.equal(90);
                    expect((await api.totalSupplyBatch(community.address, [2]))[0]).to.equal(190);
                });
        
                it("Minting existing tokens to one recipient should work", async function() {
                    await transferHooksTm.mintExistingTokens([creatorA.address], [2, 102], [90, 100])
                    
                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, creatorA.address], [2, 102]))).to.eql([90, 150]);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, [2, 102]))).to.eql([190, 350]);
                });
            });
    
            describe("Multiple recipients", function () {
                it("Minting existing token to multiple recipients (same amounts) should work", async function () {
                    await transferHooksTm.mintExistingTokens([creatorA.address, fanA.address, addrs[0].address], [2], [90])
                    
                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, fanA.address, addrs[0].address], [2, 2, 2]))).to.eql([90, 90, 90]);
                    expect((await api.totalSupplyBatch(community.address, [2]))[0]).to.equal(370);
                });
        
                it("Minting existing token to multiple recipients (different amounts) should work", async function () {
                    await transferHooksTm.mintExistingTokens([creatorA.address, fanA.address, addrs[0].address], [102], [90, 85, 20])
                    
                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, fanA.address, addrs[0].address], [102, 102, 102]))).to.eql([140, 285, 20]);
                    expect((await api.totalSupplyBatch(community.address, [102]))[0]).to.equal(445);
                });
        
                it("Minting existing tokens to multiple recipients (different amounts) should work", async function () {
                    await transferHooksTm.mintExistingTokens([creatorA.address, fanA.address, addrs[0].address], [2, 101, 2], [90, 85, 20])
                    
                    expect(arrayToNum(await community.balanceOfBatch([creatorA.address, fanA.address, addrs[0].address], [2, 101, 2]))).to.eql([90, 85, 20]);
                    expect(arrayToNum(await api.totalSupplyBatch(community.address, [2, 101]))).to.eql([210, 185]);
                });
            })
    
            it("Minting existing tokens with invalid inputs should all fail", async function () {
                await expect(transferHooksTm.mintExistingTokens([creatorA.address], [1], [9, 10]))
                    .to.be.revertedWith("Invalid array");
    
                await expect(transferHooksTm.mintExistingTokens([creatorA.address, fanA.address], [1, 2], [9, 10, 14]))
                    .to.be.revertedWith("Invalid input");
            });

            */

            /*

            describe("Mint existing no-ops", function () {
                it("Minting existing token on token manager should be a no-op", async function () {
                    await expect(transferHooksTm.mintExistingTokens([creatorA.address], [2], [90]))
                        .to.be.revertedWith("no-op, reserved for interface");
                });

                it("Minting existing token minimized should be a no-op", async function () {
                    await expect(community.mintExistingMinimized([creatorA.address, fanA.address, addrs[0].address], 2, 90, ethers.utils.arrayify("0x")))
                        .to.be.revertedWith("no-op, reserved for interface");
                });
            })

            */
        }); 
    
    });
    
    describe("Token manager restrictions with minting", function () {    
        beforeEach(async function () {
            const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
            community = deployedCommunity
            basicTm = deployedBasicTm
        });
    
        it("Only token managers should be able to mint on a community", async function () {
            await expect(community.managerMintNewToOne(creatorA.address, [1], [""], [true]))
                .to.be.revertedWith("Unregistered token manager")
    
            await expect(community.managerMintNewToMultiple([creatorA.address],[1], "uri", true))
                .to.be.revertedWith("Unregistered token manager")
        })
    
        /* With current set of token managers, minting existing tokens is deprecated. Commenting out as other token managers may enable this functionality */
        /*
        it("Only managers of existing tokens should be able to mint more of them", async function () {
            await expect(basicTm.mintExistingTokens([creatorA.address], [10], [100]))
                .to.be.revertedWith("Unauthorized tokenManager")
        })
        */
    })

    describe("Stress minting", function () {
        beforeEach(async function () {
            const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
            community = deployedCommunity
            basicTm = deployedBasicTm
        });

        it("Minting many membership tokens should result in the correct alternating scheme for membership and benefit tokens", async function () {
            const amounts = []
            const isMembership = []
            for (let i = 0; i < 100; i++) {
                amounts.push(i + 1)
                isMembership.push(true)
            }

            const expectedIds = []
            const highlightAddresses = []
            for (let i = 0; i < 500; i++) {
                expectedIds.push(200*(~~(i / 100)) + (i % 100) + 1)
                highlightAddresses.push(highlight.address)
            }

            const expectedAmounts = amounts.concat(amounts).concat(amounts).concat(amounts).concat(amounts).map(amount => ethers.BigNumber.from(amount))
            
            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")
                
            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            expect(await community.balanceOfBatch(highlightAddresses, expectedIds)).to.eql(expectedAmounts);
        })

        it("Minting many benefit tokens should result in the correct alternating scheme for membership and benefit tokens", async function () {
            const amounts = []
            const isMembership = []
            for (let i = 0; i < 100; i++) {
                amounts.push(10)
                isMembership.push(false)
            }

            const expectedIds = []
            const highlightAddresses = []
            for (let i = 0; i < 500; i++) {
                expectedIds.push(200*(~~(i / 100)) + (i % 100) + 101)
                highlightAddresses.push(highlight.address)
            }
            
            const expectedAmounts = amounts.concat(amounts).concat(amounts).concat(amounts).concat(amounts).map(amount => ethers.BigNumber.from(amount))
            
            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")
                
            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            expect(await community.balanceOfBatch(highlightAddresses, expectedIds)).to.eql(expectedAmounts);
        })

        it("Minting many tokens should result in the correct alternating scheme for membership and benefit tokens", async function () {
            const amounts = []
            const isMembership = []
            for (let i = 0; i < 100; i++) {
                if (i % 2 == 0) {
                    amounts.push(10)
                    isMembership.push(false)
                } else {
                    amounts.push(20)
                    isMembership.push(true)
                }
            }

            const expectedIds = []
            const highlightAddresses = []
            const expectedAmounts = []
            for (let i = 0; i < 250; i++) {
                expectedIds.push(200*(~~(i / 100)) + (i % 100) + 1)
                highlightAddresses.push(highlight.address)
                expectedAmounts.push(ethers.BigNumber.from(20))
            }
            for (let i = 0; i < 250; i++) {
                expectedIds.push(200*(~~(i / 100)) + (i % 100) + 101)
                highlightAddresses.push(highlight.address)
                expectedAmounts.push(ethers.BigNumber.from(10))
            }
            
            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")
                
            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            await expect(basicTm.mintNewTokensToOne(highlight.address, amounts, [], isMembership))
                .to.emit(community, "TransferBatch")
                .to.emit(basicTm, "MintedNewTokensToOne")

            expect(await community.balanceOfBatch(highlightAddresses, expectedIds)).to.eql(expectedAmounts);
        })

        it("isMembershipToken correctly determines if token ids are expected to be membership token ids", async function () {
            expect(await community.isMembershipToken(0)).to.equal(false);
            expect(await community.isMembershipToken(1)).to.equal(true);
            expect(await community.isMembershipToken(100)).to.equal(true);
            expect(await community.isMembershipToken(101)).to.equal(false);
            expect(await community.isMembershipToken(200)).to.equal(false);
            expect(await community.isMembershipToken(201)).to.equal(true);
            expect(await community.isMembershipToken(300)).to.equal(true);
            expect(await community.isMembershipToken(301)).to.equal(false);
        })
    })
})

