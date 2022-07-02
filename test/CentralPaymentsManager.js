const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
    factorySetupCommunityWithRegisteredTM,
    WETHMetaTx, 
    deployCommunityFactory2,
    deployGlobalBasicTokenManager,
    sign2771MetaTxRequest,
    MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION
} = require("../utils/test-utils");

const IPermissionsRegistry = require("../artifacts/contracts/permissions_registry/IPermissionsRegistry.sol/IPermissionsRegistry.json");
const IPermissionsRegistryABI = IPermissionsRegistry["abi"];

describe("CentralPaymentsManager", function () {
    let CommunityFactory;
    let factory;

    let Beacon;
    let BasicCommunityV1Impl;
    let MinimalForwarder;
    let WETH;
    let CentralPaymentsManager;
    let beacon;
    let minimalForwarder;
    let community;
    let basicTm;
    let weth;
    let centralPaymentsManager;
    let permissionsRegistry;

    let wethMetaTx;

    let highlight;
    let creatorA;
    let fanA;
    let highlightBeaconAdmin;
    let addrs;

    this.timeout(100000);

    before(async function () {
        BasicCommunityV1Impl = await ethers.getContractFactory("BasicCommunityV1");
        Beacon = await ethers.getContractFactory("UpgradeableBeacon"); 
        MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
        CentralPaymentsManager = await ethers.getContractFactory("CentralPaymentsManager");
        [highlight, creatorA, fanA, highlightBeaconAdmin, proxyAdminOwner, defaultAdmin, owner, permissionsRegistryAdmin, vault, ...addrs] = await ethers.getSigners();
        WETH = await ethers.getContractFactory("MaticWETH", fanA);
        
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

        // deploy weth, fanA will start with 100 wETH, also whitelist wETH on permissions registry
        weth = await WETH.deploy(highlightBeaconAdmin.address);
        await weth.deployed();
        permissionsRegistry = new ethers.Contract(await factory.permissionsRegistry(), IPermissionsRegistryABI, permissionsRegistryAdmin);
        const tx = await permissionsRegistry.whitelistCurrency(weth.address);
        await tx.wait();

        wethMetaTx = new WETHMetaTx(weth);

        centralPaymentsManager = await CentralPaymentsManager.deploy(await factory.permissionsRegistry(), minimalForwarder.address);
        await centralPaymentsManager.deployed();
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

        const mintTx = await deployedBasicTm.mintNewTokensToOne(vault.address, [100, 10], ["token 1 uri", "token 101 uri"], [true, false])
        await mintTx.wait();

        community = deployedCommunity
        basicTm = deployedBasicTm
    })

    describe("Purchase with minimal forwarder", function () {
        it("Platform executor should be able to execute a well-formed and signed purchase", async function () {
            const listing = {
                community, 
                tokenIds: [1, 101],
                amounts: [1, 1],
                price: 2 // wETH
            }
            const wETHWei = ethers.utils.parseUnits(listing.price.toString(), 18);
            const wETHWeiToCreator = wETHWei.mul(97).div(100).toString(); 
            const wETHWeiToPlatform = wETHWei.mul(3).div(100).toString(); 
            const firstNonce = await wethMetaTx.contract.getNonce(fanA.address);

            // construct signed request from purchaser, sending 97% of price to creator
            const transferToCreatorData = await weth.interface.encodeFunctionData("transfer", [creatorA.address, wETHWeiToCreator]);
            const purchaseToCreatorMetaTxPacket = await wethMetaTx.signWETHMetaTxRequest(
                fanA, 
                fanA.address, 
                transferToCreatorData,
                firstNonce
            );

            // construct signed request from purchaser, sending 3% of price to platform (vault in this case)
            const transferToPlatformData = await weth.interface.encodeFunctionData("transfer", [vault.address, wETHWeiToPlatform]);
            const purchaseToPlatformMetaTxPacket = await wethMetaTx.signWETHMetaTxRequest(
                fanA, 
                fanA.address, 
                transferToPlatformData,
                firstNonce.toNumber() + 1
            );

            // construct signed request from executor, moving tokens out of vault to purchaser 
            const { signature, request } = await sign2771MetaTxRequest(highlight, minimalForwarder, {
                from: highlight.address,
                to: community.address,
                gas: MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION,
                data: await community.interface.encodeFunctionData("safeBatchTransferFrom", [
                    vault.address, 
                    fanA.address, 
                    listing.tokenIds, 
                    listing.amounts, 
                    ethers.utils.arrayify("0x")
                ])
            })

            // replicating contract verification - equivalent in our backend
            const transferToCreatorMetaTx = {
                nonce: firstNonce.toString(),
                from: fanA.address, 
                functionSignature: transferToCreatorData
            }
            const transferToPlatformMetaTx = {
                nonce: (firstNonce + 1).toString(),
                from: fanA.address, 
                functionSignature: transferToPlatformData
            }
            expect(
                wethMetaTx.verify(
                    fanA.address, 
                    transferToCreatorMetaTx, 
                    ethers.utils.joinSignature({ r: purchaseToCreatorMetaTxPacket.sigR, s: purchaseToCreatorMetaTxPacket.sigS, v: purchaseToCreatorMetaTxPacket.sigV })
                )
            )
            expect(
                wethMetaTx.verify(
                    fanA.address, 
                    transferToPlatformMetaTx, 
                    ethers.utils.joinSignature({ r: purchaseToPlatformMetaTxPacket.sigR, s: purchaseToPlatformMetaTxPacket.sigS, v: purchaseToPlatformMetaTxPacket.sigV })
                )
            )
            expect(await minimalForwarder.verify(request, signature)).to.equal(true);
            
            // purchase
            await expect(centralPaymentsManager.purchaseTokenWithMetaTxSupportedCurrency(
                weth.address,
                fanA.address,
                signature,
                request,
                purchaseToCreatorMetaTxPacket,
                purchaseToPlatformMetaTxPacket,
                ethers.utils.parseUnits(listing.price.toString()),
                listing.tokenIds
            )).to.emit(centralPaymentsManager, "CentralSale")
                .withArgs(
                    ethers.utils.getAddress(community.address), 
                    fanA.address, 
                    weth.address, 
                    ethers.utils.parseUnits(listing.price.toString()), 
                    listing.tokenIds
                );

            // validate: 
            expect((await weth.balanceOf(creatorA.address)).toString()).to.equal(wETHWeiToCreator);
            expect((await weth.balanceOf(vault.address)).toString()).to.equal(wETHWeiToPlatform);
            expect(await weth.balanceOf(fanA.address)).to.equal(ethers.BigNumber.from("100000000000000000000").sub(wETHWei));
            expect(await community.balanceOfBatch([fanA.address, fanA.address], listing.tokenIds)).to.eql(listing.amounts.map(amount => ethers.BigNumber.from(amount)));
            // if passed in approval for OS, OS is approved
        })
    })

    describe("Purchase with permissioned CentralPaymentsManager", function () {
        beforeEach(async function () {
            // whitelist the central payments manager as an executor on the PermissionsRegistry which is what makes this approach possible
            expect(await permissionsRegistry.addPlatformExecutor(centralPaymentsManager.address))
                .to.emit(permissionsRegistry, "PlatformExecutorAdded")
                .withArgs(centralPaymentsManager.address)
        })

        it("Platform executor should be able to execute a well-formed and signed purchase", async function () {
            const saleItem = {
                community: community.address, 
                tokenIds: [1, 101],
                amounts: [1, 1],
                price: 2, // wETH
                vault: vault.address,
                transferData: ethers.utils.arrayify("0x")
            }
            const wETHWei = ethers.utils.parseUnits(saleItem.price.toString(), 18);
            const wETHWeiToCreator = wETHWei.mul(97).div(100);
            const wETHWeiToPlatform = wETHWei.mul(3).div(100); 
            const firstNonce = await wethMetaTx.contract.getNonce(fanA.address);

            // construct signed request from purchaser, sending 97% of price to creator
            const transferToCreatorData = await weth.interface.encodeFunctionData("transfer", [creatorA.address, wETHWeiToCreator.toString()]);
            const purchaseToCreatorMetaTxPacket = await wethMetaTx.signWETHMetaTxRequest(
                fanA, 
                fanA.address, 
                transferToCreatorData,
                firstNonce
            );

            // construct signed request from purchaser, sending 3% of price to platform (vault in this case)
            const transferToPlatformData = await weth.interface.encodeFunctionData("transfer", [vault.address, wETHWeiToPlatform.toString()]);
            const purchaseToPlatformMetaTxPacket = await wethMetaTx.signWETHMetaTxRequest(
                fanA, 
                fanA.address, 
                transferToPlatformData,
                firstNonce.toNumber() + 1
            );

            // replicating contract verification - equivalent in our backend
            const transferToCreatorMetaTx = {
                nonce: firstNonce.toString(),
                from: fanA.address, 
                functionSignature: transferToCreatorData
            }
            const transferToPlatformMetaTx = {
                nonce: (firstNonce + 1).toString(),
                from: fanA.address, 
                functionSignature: transferToPlatformData
            }
            expect(
                wethMetaTx.verify(
                    fanA.address, 
                    transferToCreatorMetaTx, 
                    ethers.utils.joinSignature({ r: purchaseToCreatorMetaTxPacket.sigR, s: purchaseToCreatorMetaTxPacket.sigS, v: purchaseToCreatorMetaTxPacket.sigV })
                )
            )
            expect(
                wethMetaTx.verify(
                    fanA.address, 
                    transferToPlatformMetaTx, 
                    ethers.utils.joinSignature({ r: purchaseToPlatformMetaTxPacket.sigR, s: purchaseToPlatformMetaTxPacket.sigS, v: purchaseToPlatformMetaTxPacket.sigV })
                )
            )
            
            // purchase
            const expectedPriceInWei = ethers.utils.parseUnits(saleItem.price.toString());
            saleItem.price = expectedPriceInWei;
            await expect(centralPaymentsManager.purchaseTokenWithMetaTxSupportedCurrencyAndPermissionedExecutor(
                weth.address,
                fanA.address,
                saleItem,
                purchaseToCreatorMetaTxPacket,
                purchaseToPlatformMetaTxPacket
            )).to.emit(centralPaymentsManager, "CentralSale")
                .withArgs(
                    ethers.utils.getAddress(community.address), 
                    fanA.address, 
                    weth.address, 
                    expectedPriceInWei, 
                    saleItem.tokenIds
                );

            // validate: 
            expect((await weth.balanceOf(creatorA.address)).toString()).to.equal(wETHWeiToCreator.mul(2));
            expect((await weth.balanceOf(vault.address)).toString()).to.equal(wETHWeiToPlatform.mul(2));
            expect(await weth.balanceOf(fanA.address)).to.equal(ethers.BigNumber.from("100000000000000000000").sub(wETHWei.mul(2)));
            expect(await community.balanceOfBatch([fanA.address, fanA.address], saleItem.tokenIds)).to.eql(saleItem.amounts.map(amount => ethers.BigNumber.from(amount)));
            // if passed in approval for OS, OS is approved
        })
    })
})
    
    