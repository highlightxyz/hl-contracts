const { expect } = require("chai");
const { ethers } = require("hardhat");

const { 
    factorySetupCommunity,
    deployCommunityFactory2,
    deployGlobalBasicTokenManager
} = require("../utils/test-utils");

describe("Registering token manager", function () {
  let CommunityFactory;
  let factory;
  let Beacon;
  let BasicCommunityV1Impl;
  let TransferHooksTokenManager;
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
    const { deployedCommunity, deployedBasicTm } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
    community = deployedCommunity
    basicTm = deployedBasicTm

    transferHooksTm = await TransferHooksTokenManager.deploy(community.address);
    await transferHooksTm.deployed();
  });

  describe("Highlight", function () {
    it("should be able to register basic membership token manager on basic community", async function () {
        await expect(community.registerTokenManager(ethers.utils.getAddress(basicTm.address)))
            .to.emit(community, 'TokenManagerRegistered')
            .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address);

        expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(true);
    });

    it("should be able to register transfer hooks token manager on basic community", async function () {
        await expect(community.registerTokenManager(transferHooksTm.address))
            .to.emit(community, 'TokenManagerRegistered')
            .withArgs(transferHooksTm.address, highlight.address);
    
        expect((await community.tokenManagers()).includes(transferHooksTm.address)).to.equal(true);
    });
  })

  describe("Creator", function () {
      beforeEach(function () {
        community = community.connect(creatorA);
      })

      it("should be able to register basic token manager on basic community", async function () {
        await expect(community.registerTokenManager(ethers.utils.getAddress(basicTm.address)))
            .to.emit(community, 'TokenManagerRegistered')
            .withArgs(ethers.utils.getAddress(basicTm.address), creatorA.address);
    
        expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(true);
      });
    
      it("should be able to register transfer hooks token manager on basic community", async function () {
        await expect(community.registerTokenManager(transferHooksTm.address))
            .to.emit(community, 'TokenManagerRegistered')
            .withArgs(transferHooksTm.address, creatorA.address);
    
        expect((await community.tokenManagers()).includes(transferHooksTm.address)).to.equal(true);
      });
  })

  describe("Member", function () {
      beforeEach(function () {
        community = community.connect(fanA);
      })

      it("should not be able to register basic token manager on basic community", async function () {
        await expect(community.registerTokenManager(ethers.utils.getAddress(basicTm.address)))
            .to.be.revertedWith("Unauthorized");
    
        expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(false);
      });
  })

  it("Highlight/CreatorA should be able to register multiple token managers (basic/transfer hooks) on basic community", async function () {
    await expect(community.registerTokenManager(ethers.utils.getAddress(basicTm.address)))
        .to.emit(community, 'TokenManagerRegistered')
        .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address);
    
    community = community.connect(creatorA);
    await expect(community.registerTokenManager(transferHooksTm.address))
        .to.emit(community, 'TokenManagerRegistered')
        .withArgs(transferHooksTm.address, creatorA.address);

    expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(true);
    expect((await community.tokenManagers()).includes(transferHooksTm.address)).to.equal(true);
  });
});

describe("Setting/unregistering token managers", function () {
    let CommunityFactory;
    let factory;

    let Beacon;
    let BasicCommunityV1Impl;
    let TransferHooksTokenManager;
    let community;
    let beacon;
    let basicTm;

    let highlight;
    let creatorA;
    let fanA;
    let addrs;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
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
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        transferHooksTm = await TransferHooksTokenManager.deploy(community.address);
        await transferHooksTm.deployed();

        await community.registerTokenManager(ethers.utils.getAddress(basicTm.address));
    });

    describe("Highlight default admin", function () {
        beforeEach(async function () {
            community = community.connect(highlightBeaconAdmin)

            await basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]);
        })

        it("should be unable to register a token manager", async function () {
            await expect(community.registerTokenManager(ethers.utils.getAddress(transferHooksTm.address)))
                .to.be.revertedWith("Unauthorized")
        });

        it("should be unable to unregister a token manager", async function () {
            await expect(community.unregisterTokenManager(ethers.utils.getAddress(transferHooksTm.address)))
                .to.be.revertedWith("Unauthorized")
        });

        it("should not be able to set a token's manager", async function () {
            await basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]);

            expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(true);
            
            await expect(community["setTokenManager(uint256,address)"](1, ethers.utils.getAddress(basicTm.address)))
                .to.be.revertedWith("Unauthorized")
        });
        
    });

    describe("Highlight platform executor", function () {
        it("should be unable to set a token manager for a token without a manager (aka token wasn't minted)", async function () {
            expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(true);
            
            await expect(community["setTokenManager(uint256,address)"](1, ethers.utils.getAddress(basicTm.address)))
                .to.be.revertedWith("No existing manager")
        });

        it("should be able to unregister a token manager", async function () {
            await expect(community.unregisterTokenManager(ethers.utils.getAddress(basicTm.address)))
                .to.emit(community, "TokenManagerUnregistered")
                .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address); 
    
            expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(false);
        });
    
        it("should be able to set a token's manager to a currently unregistered token manager", async function () {
            await basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]);
            expect((await community.tokenManagers()).includes(transferHooksTm.address)).to.equal(false);
            
            await expect(community["setTokenManager(uint256,address)"](1, transferHooksTm.address))
                .to.emit(community, "TokenManagerRegistered")
                .withArgs(transferHooksTm.address, highlight.address)
                .to.emit(community, "TokenManagerSet")
                .withArgs(1, transferHooksTm.address, highlight.address);
    
            expect((await community.tokenManagers()).includes(transferHooksTm.address)).to.equal(true);
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(transferHooksTm.address);
        });
    
        it("should be able to set a token's manager that had been previously set", async function () {
            await basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]);
            await expect(community["setTokenManager(uint256,address)"](1, ethers.utils.getAddress(transferHooksTm.address)))
                .to.emit(community, "TokenManagerSet")
                .withArgs(1, ethers.utils.getAddress(transferHooksTm.address), highlight.address);
    
            expect((await community.tokenManagers()).includes(ethers.utils.getAddress(transferHooksTm.address))).to.equal(true);
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(transferHooksTm.address));
            
            await expect(community["setTokenManager(uint256,address)"](1, basicTm.address))
                .to.emit(community, "TokenManagerSet")
                .withArgs(1, ethers.utils.getAddress(basicTm.address), highlight.address);
    
            expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(true);
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(basicTm.address));
        })
    });

    describe("Creator", function () {
        beforeEach(function () {
          community = community.connect(creatorA);
        })

        it("should be able to unregister a token manager", async function () {
            await expect(community.unregisterTokenManager(ethers.utils.getAddress(basicTm.address)))
                .to.emit(community, "TokenManagerUnregistered")
                .withArgs(ethers.utils.getAddress(basicTm.address), creatorA.address); 
    
            expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(false);
        });

        it("should not be able to set a token's manager", async function () {
            await basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]);

            expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(true);
            
            await expect(community["setTokenManager(uint256,address)"](1, ethers.utils.getAddress(basicTm.address)))
                .to.be.revertedWith("Unauthorized")
        });
    });

    describe("Member", function () {
        beforeEach(function () {
          community = community.connect(fanA);
        })

        it("should not be able to unregister a token manager", async function () {
            community = community.connect(fanA);
            await expect(community.unregisterTokenManager(ethers.utils.getAddress(basicTm.address)))
                .to.be.revertedWith("Unauthorized");
    
            expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(true);
        });
    
        it("should be unable to set a token's manager", async function () {
            await basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]);
    
            await expect(community["setTokenManager(uint256,address)"](1, ethers.utils.getAddress(basicTm.address)))
                .to.be.revertedWith(`Unauthorized`);
    
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(basicTm.address));
        });
    });
});

describe("Token manager management with tokens being managed and minted", function () {
    let CommunityFactory;
    let factory;

    let Beacon;
    let BasicCommunityV1Impl;
    let TransferHooksTokenManager;
    let MinimalForwarder;
    let community;
    let beacon;
    let basicTm;

    let highlight;
    let creatorA;
    let fanA;
    let addrs;

    before(async function () {
        CommunityFactory = await ethers.getContractFactory("CommunityFactory");
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon"); 
        TransferHooksTokenManager = await ethers.getContractFactory("TransferHooksTokenManager2");
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, permissionsRegistryAdmin,vault, ...addrs] = await ethers.getSigners();
        
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
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunity(highlight, factory, beacon, creatorA.address, highlightBeaconAdmin.address, highlight.address, addrs[0], "Test", "Test uri");
        community = deployedCommunity
        basicTm = deployedBasicTm

        transferHooksTm = await TransferHooksTokenManager.deploy(community.address);
        await transferHooksTm.deployed();

        await community.registerTokenManager(ethers.utils.getAddress(basicTm.address));
    });

    describe("Highlight default admin", function () {
        beforeEach(function () {
            community = community.connect(highlightBeaconAdmin)
        })

        it("should be able to set a token manager on mint", async function () {
            await basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]);
    
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(basicTm.address));
        }); 
    })

    describe("Highlight platform admin", function () {
        beforeEach(function () {
            community = community.connect(highlight)
        })

        it("should be able to unregister a tokenManager if it manages any tokens", async function () {
            await basicTm.mintNewTokensToOne(creatorA.address, [1, 2, 3, 1], [], [true, false, false, false]);
    
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(basicTm.address));
    
            await expect(community.unregisterTokenManager(ethers.utils.getAddress(basicTm.address)))
                .emit(community, "TokenManagerUnregistered")
                .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address); 

            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(basicTm.address));
        });

        it("should be able to change the token manager for a minted token", async function () {
            await basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]);
    
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(ethers.utils.getAddress(basicTm.address));
    
            expect(await community.setTokenManager(1, transferHooksTm.address))
                .emit(community, "TokenManagerRegistered")
                .withArgs(transferHooksTm.address, highlight.address)
                .emit(community, "TokenManagerSet")
                .withArgs(1, transferHooksTm.address, highlight.address);
    
            expect((await community.tokenManagerBatch([1]))[0]).to.equal(transferHooksTm.address);
        });
    })

    it("An unregistered token manager should not be able to mint", async function () {
        await expect(transferHooksTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]))
            .to.be.revertedWith("Unregistered token manager");
    });

    it("A previously registered token manager that was unregistered should be unable to mint", async function () {
        expect(await community.unregisterTokenManager(ethers.utils.getAddress(basicTm.address)))
            .emit(community, "TokenManagerUnregistered")
            .withArgs(ethers.utils.getAddress(basicTm.address), highlight.address); 

        expect((await community.tokenManagers()).includes(ethers.utils.getAddress(basicTm.address))).to.equal(false);

        await expect(basicTm.mintNewTokensToOne(creatorA.address, [1], [""], [true]))
            .to.be.revertedWith("Unregistered token manager");
    }); 
});

