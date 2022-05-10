const { expect } = require("chai");
const { ethers } = require("hardhat");
const { factorySetupCommunityWithRegisteredTM } = require("../utils/test-utils");
const { signMetaTxRequest, MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION } = require("../utils/test-utils.js");

const ISplitMain = require("../artifacts/contracts/royalties/interfaces/ISplitMain.sol/ISplitMain.json");
const ISplitMainABI = ISplitMain["abi"];

describe("Meta Transactions", function () {
    let CommunityFactory;
    let factory;

    let Beacon;
    let BasicCommunityV1Impl;
    let MinimalForwarder;
    let beacon;
    let minimalForwarder;
    let community;
    let basicTm;
    let splitMain;

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
        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, defaultAdmin, owner, permissionsRegistryAdmin, vault, ...addrs] = await ethers.getSigners();
        
        const impl = await BasicCommunityV1Impl.deploy();
        await impl.deployed();
        beacon = await Beacon.deploy(impl.address);
        await beacon.deployed();  
        minimalForwarder = await MinimalForwarder.deploy();
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
        // setup a community, basic tm, and token that we will play around with 
        const { deployedCommunity, deployedBasicTm } = await factorySetupCommunityWithRegisteredTM(
            highlight,
            factory,
            beacon,
            creatorA.address,
            defaultAdmin.address,
            owner.address,
            addrs[0],
            "Test Community",
            "testuri.com"
        )

        const mintTx = await deployedBasicTm.mintNewTokensToOne(highlight.address, [100, 10], ["token 1 uri", "token 101 uri"], [true, false])
        await mintTx.wait();

        community = deployedCommunity
        basicTm = deployedBasicTm
        splitMain = new ethers.Contract(await factory.splitMain(), ISplitMainABI, highlight);
    })

    describe("MinimalForwarder", function () {
        it("Not encoding enough gas for an operation fails the operation", async function () {
            const { signature, request } = await signMetaTxRequest(creatorA, minimalForwarder, {
                from: creatorA.address,
                to: community.address,
                gas: 46200,
                data: await community.interface.encodeFunctionData("swapPlatform", [fanA.address])
            })

            expect(await minimalForwarder.verify(request, signature)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(highlight);

            await expect(minimalForwarder.execute(request, signature))
                .to.be.revertedWith("")
        })

        it("Mismatched signers from the from address of a request are not allowed", async function () {
            const { signature, request } = await signMetaTxRequest(creatorA, minimalForwarder, {
                from: defaultAdmin.address,
                to: community.address,
                gas: 60000,
                data: await community.interface.encodeFunctionData("swapDefaultAdmin", [creatorA.address])
            })

            expect(await minimalForwarder.verify(request, signature)).to.equal(false);
            
            minimalForwarder = minimalForwarder.connect(highlight);

            await expect(minimalForwarder.execute(request, signature))
                .to.be.revertedWith("MinimalForwarder: signature does not match request")
        })

        it("Mismatched data in a request is not allowed", async function () {
            const { signature, request } = await signMetaTxRequest(creatorA, minimalForwarder, {
                from: creatorA.address,
                to: community.address,
                gas: 60000,
                data: await community.interface.encodeFunctionData("swapPlatform", [fanA.address])
            })

            request.gas = 60001;

            expect(await minimalForwarder.verify(request, signature)).to.equal(false);
            
            minimalForwarder = minimalForwarder.connect(highlight);

            await expect(minimalForwarder.execute(request, signature))
                .to.be.revertedWith("MinimalForwarder: signature does not match request")
        })

        it("Sending a request from a non-trusted forwarder does not invoke meta transaction functionality", async function () {
            let newMinimalForwarder = await MinimalForwarder.deploy();
            await newMinimalForwarder.deployed();

            // this operation would have succeeded from the trusted forwarder, but since it's not trusted, the 
            const { signature, request } = await signMetaTxRequest(creatorA, newMinimalForwarder, {
                from: creatorA.address,
                to: community.address,
                gas: 50000,
                data: await community.interface.encodeFunctionData("swapPlatform", [fanA.address])
            })

            expect(await newMinimalForwarder.verify(request, signature)).to.equal(true);
            
            newMinimalForwarder = newMinimalForwarder.connect(highlight);

            await expect(newMinimalForwarder.execute(request, signature))
                .to.be.revertedWith("AccessControl:") // roughly. the bytes conversion to string makes it annoying to assert on the exact string
        })
    })

    describe("Community", function () {
        it("Setting royalty split with meta-transactions works as expected (including expected failures)", async function () {
            const { signature, request } = await signMetaTxRequest(defaultAdmin, minimalForwarder, {
                from: defaultAdmin.address,
                to: community.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await community.interface.encodeFunctionData("setRoyaltyCut", [100])
            })

            expect(await minimalForwarder.verify(request, signature)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(fanA);

            await expect(minimalForwarder.execute(request, signature))
                .to.emit(community, "RoyaltyCutSet")
                .withArgs(1000, 100);

            const { signature: signature2, request: request2 } = await signMetaTxRequest(creatorA, minimalForwarder, {
                from: creatorA.address,
                to: community.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await community.interface.encodeFunctionData("setRoyaltyCut", [100])
            })

            expect(await minimalForwarder.verify(request2, signature2)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(defaultAdmin);

            await expect(minimalForwarder.execute(request2, signature2))
                .to.be.revertedWith("Unauthorized")

            // normal also works
            community = community.connect(defaultAdmin);
            await expect(community.setRoyaltyCut(200))
                .to.emit(community, "RoyaltyCutSet")
                .withArgs(100, 200);
        })

        it("Managing token managers with meta-transactions works as expected (including expected failures)", async function () {
            const { signature, request } = await signMetaTxRequest(creatorA, minimalForwarder, {
                from: creatorA.address,
                to: community.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await community.interface.encodeFunctionData("unregisterTokenManager", [basicTm.address])
            })

            expect(await minimalForwarder.verify(request, signature)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(fanA);

            await expect(minimalForwarder.execute(request, signature))
                .to.emit(community, "TokenManagerUnregistered")
                .withArgs(ethers.utils.getAddress(basicTm.address), ethers.utils.getAddress(creatorA.address));

            const { signature: signature2, request: request2 } = await signMetaTxRequest(fanA, minimalForwarder, {
                from: fanA.address,
                to: community.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await community.interface.encodeFunctionData("registerTokenManager", [basicTm.address])
            })

            expect(await minimalForwarder.verify(request2, signature2)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(creatorA);

            await expect(minimalForwarder.execute(request2, signature2))
                .to.be.revertedWith("Unauthorized")

            // normal also works
            community = community.connect(creatorA);
            await expect(community.registerTokenManager(basicTm.address))
                .to.emit(community, "TokenManagerRegistered")
                .withArgs(ethers.utils.getAddress(basicTm.address), ethers.utils.getAddress(creatorA.address));
        })
    })

    describe("SplitMain", function () {
        it("Managing primary controller for a split with meta-transactions works as expected (including expected failures)", async function () {
            const { signature, request } = await signMetaTxRequest(defaultAdmin, minimalForwarder, {
                from: defaultAdmin.address,
                to: splitMain.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await splitMain.interface.encodeFunctionData("grantPrimaryController", [await community.royaltySplit(), creatorA.address])
            })

            expect(await minimalForwarder.verify(request, signature)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(fanA);

            await expect(minimalForwarder.execute(request, signature))
                .to.emit(splitMain, "NewPrimaryController")

            const { signature: signature2, request: request2 } = await signMetaTxRequest(fanA, minimalForwarder, {
                from: fanA.address,
                to: splitMain.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await splitMain.interface.encodeFunctionData("grantPrimaryController", [await community.royaltySplit(), fanA.address])
            })

            expect(await minimalForwarder.verify(request2, signature2)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(creatorA);

            await expect(minimalForwarder.execute(request2, signature2))
                .to.be.revertedWith("")

            // normal also works
            splitMain = splitMain.connect(creatorA);
            await expect(splitMain.grantPrimaryController(await community.royaltySplit(), fanA.address))
                .to.emit(splitMain, "NewPrimaryController");
        })

        it("Managing secondary controllers for a split with meta-transactions works as expected (including expected failures)", async function () {
            const { signature, request } = await signMetaTxRequest(addrs[0], minimalForwarder, {
                from: addrs[0].address,
                to: splitMain.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await splitMain.interface.encodeFunctionData("grantSecondaryController", [await community.royaltySplit(), fanA.address])
            })

            expect(await minimalForwarder.verify(request, signature)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(fanA);

            await expect(minimalForwarder.execute(request, signature))
                .to.emit(splitMain, "NewSecondaryController")

            const { signature: signature2, request: request2 } = await signMetaTxRequest(defaultAdmin, minimalForwarder, {
                from: defaultAdmin.address,
                to: splitMain.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await splitMain.interface.encodeFunctionData("grantSecondaryController", [await community.royaltySplit(), highlightBeaconAdmin.address])
            })

            expect(await minimalForwarder.verify(request2, signature2)).to.equal(true);
            
            minimalForwarder = minimalForwarder.connect(creatorA);

            await expect(minimalForwarder.execute(request2, signature2))
                .to.be.revertedWith("")

            // normal also works
            splitMain = splitMain.connect(fanA);
            await expect(splitMain.grantSecondaryController(await community.royaltySplit(), highlightBeaconAdmin.address))
                .to.emit(splitMain, "NewSecondaryController");
        })
    })
})

