const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factorySetupCommunityWithRegisteredTM, arrayToNum } = require("../utils/test-utils");

describe("ERC1155 Transfers/Approvals", function () {
    let CommunityFactory;
    let factory;

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
        basicTm = deployedBasicTm

        tx = await basicTm.mintNewTokensToOne(fanA.address, [10, 20], [], [true, false]);
        await tx.wait();
    }); 

    describe("Member", function () {
        beforeEach(function () {
            community = community.connect(fanA);
        });

        it("should be able to transfer a token they own", async function () {
            await community.safeTransferFrom(fanA.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String(""))
            
            expect(await community.balanceOf(fanA.address, 101)).to.equal(13);
            expect(await community.balanceOf(addrs[0].address, 101)).to.equal(7);
        });
    
        it("should be able to transfer tokens they own", async function () {
            await community.safeBatchTransferFrom(fanA.address, addrs[0].address, [1, 101], [7, 7], ethers.utils.formatBytes32String(""))
            
            expect(arrayToNum(await community.balanceOfBatch([fanA.address, fanA.address, addrs[0].address, addrs[0].address], [1, 101, 1, 101]))).to.eql([3, 13, 7, 7]);
        })
    }); 

    describe("Operator", function () {
        beforeEach(function () {
            community = community.connect(fanA);
        });

        it("should be able to transfer a member's token depending on approval status", async function () {
            expect(await community.isApprovedForAll(fanA.address, addrs[0].address)).to.equal(false);
            
            await expect(community.setApprovalForAll(addrs[0].address, true))
                .to.emit(community, "ApprovalForAll")
                .withArgs(fanA.address, addrs[0].address, true);
    
            expect(await community.isApprovedForAll(fanA.address, addrs[0].address)).to.equal(true);
    
            community = community.connect(addrs[0]);
            await community.safeTransferFrom(fanA.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String(""))
            
            expect(await community.balanceOf(fanA.address, 101)).to.equal(13);
            expect(await community.balanceOf(addrs[0].address, 101)).to.equal(7);
    
            community = community.connect(fanA);
            await expect(community.setApprovalForAll(addrs[0].address, false))
                .to.emit(community, "ApprovalForAll")
                .withArgs(fanA.address, addrs[0].address, false);
    
            community = community.connect(addrs[0]);
            await expect(community.safeTransferFrom(fanA.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("ERC1155: caller unauthorized")
        })
    
        it("should be able to transfer a member's tokens depending on approval status", async function () {
            expect(await community.isApprovedForAll(fanA.address, addrs[0].address)).to.equal(false);
            
            await expect(community.setApprovalForAll(addrs[0].address, true))
                .to.emit(community, "ApprovalForAll")
                .withArgs(fanA.address, addrs[0].address, true);
    
            expect(await community.isApprovedForAll(fanA.address, addrs[0].address)).to.equal(true);
    
            community = community.connect(addrs[0]);
            await community.safeBatchTransferFrom(fanA.address, addrs[0].address, [1, 101], [7, 7], ethers.utils.formatBytes32String(""))
            
            expect(arrayToNum(await community.balanceOfBatch([fanA.address, fanA.address, addrs[0].address, addrs[0].address], [1, 101, 1, 101]))).to.eql([3, 13, 7, 7]);
    
            community = community.connect(fanA);
            await expect(community.setApprovalForAll(addrs[0].address, false))
                .to.emit(community, "ApprovalForAll")
                .withArgs(fanA.address, addrs[0].address, false);
    
            community = community.connect(addrs[0]);
            await expect(community.safeTransferFrom(fanA.address, addrs[0].address, [1, 101], [7, 7], ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("ERC1155: caller unauthorized")
        })
    })

    describe("Unauthorized account", function () {
        beforeEach(function () {
            community = community.connect(addrs[0])
        })

        it("should not be able to transfer a member's token", async function () {
            await expect(community.safeTransferFrom(fanA.address, addrs[0].address, 101, 7, ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("ERC1155: caller unauthorized")
        })
    
        it("should not be able to transfer a member's tokens", async function () { 
            await expect(community.safeBatchTransferFrom(fanA.address, addrs[0].address, [1, 101], [7, 7], ethers.utils.formatBytes32String("")))
                .to.be.revertedWith("ERC1155: caller unauthorized")
        })
    })

    it("should be able to batch transfer tokens to multiple recipients in a single transaction", async function () {
        community = community.connect(fanA);

        expect(
            arrayToNum(
                await community.balanceOfBatch(
                    [fanA.address, fanA.address, addrs[0].address, addrs[0].address, addrs[1].address, addrs[1].address], 
                    [1, 101, 1, 101, 1, 101]
                )
            )
        ).to.eql([10, 20, 0, 0, 0, 0]);

        await community.safeBatchTransferFromMultipleRecipients(fanA.address, [addrs[0].address, addrs[1].address],  [1, 101], [4, 4], ethers.utils.formatBytes32String(""))
        
        expect(
            arrayToNum(
                await community.balanceOfBatch(
                    [fanA.address, fanA.address, addrs[0].address, addrs[0].address, addrs[1].address, addrs[1].address], 
                    [1, 101, 1, 101, 1, 101]
                )
            )
        ).to.eql([2, 12, 4, 4, 4, 4]);
    });
});

describe("ERC1155 Uris", function () {
    let CommunityFactory;
    let factory;

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
        basicTm = deployedBasicTm

        tx = await basicTm.mintNewTokensToOne(fanA.address, [10, 20], [], [true, false]);
        await tx.wait();
    }); 

    describe("Highlight", function () {
        it("should be able to set a token's uri", async function () {
            await community.setTokenURI(1, "uri 1");
            
            expect(await community.uri(1)).to.equal("uri 1");
        })
    
        /* Deprecated setTokenURIs 
        it("should be able to set tokens' uris", async function () {
            await community.setTokenURIs([1, 101], ["uri 1", "uri 101"]);
            
            expect(await community.uriBatch([1, 101, 2, 3])).to.eql(["uri 1", "uri 101", "", ""]);
        })

        it("should not be able to set tokens' uris for tokens without a manager", async function () {
            await expect(community.setTokenURIs([1, 101, 3], ["uri 1", "uri 101", "uri 3"]))
                .to.be.revertedWith("Token manager not set for token")
        })
        */
    });

    describe("Creator", function () {
        beforeEach(function () {
            community = community.connect(creatorA);
        });

        it("should be able to set a token's uri", async function () {
            await community.setTokenURI(1, "uri 1");
            
            expect(await community.uri(1)).to.equal("uri 1");
        })
    
        /* Deprecated setTokenURIs 
        it("should be able to set tokens' uris", async function () {
            await community.setTokenURIs([1, 101], ["uri 1", "uri 101"]);
            
            expect(await community.uriBatch([1, 101, 2])).to.eql(["uri 1", "uri 101", ""]);
        })  
        */
    })

    describe("Unauthorized account", function () {
        beforeEach(function () {
            community = community.connect(fanA);
        });

        it("should not be able to set a token's uri", async function () {
            await expect(community.setTokenURI(1, "uri 1"))
                .to.be.revertedWith("Unauthorized")
        })
    
        /* Deprecated setTokenURIs 
        it("should not be able to set tokens' uris", async function () {
            await expect(community.setTokenURIs([1, 101], ["uri 1", "uri 2"]))
                .to.be.revertedWith("Unauthorized")
        })
        */
    });
});