// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../permissions_registry/IPermissionsRegistry.sol";
import "../metatx/IMinimalForwarder.sol";
import "../metatx/INativeMetaTransaction.sol";

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title Highlight central payments manager
 * @author ishan@highlight.xyz
 */
contract CentralPaymentsManager {
    /**
     * @dev Packet enabling impersonation of purchaser for currency
     */
    struct PurchaserMetaTxPacket {
        bytes functionSignature;
        bytes32 sigR;
        bytes32 sigS;
        uint8 sigV;
    }

    /**
     * @dev System permissions registry
     */
    address private immutable _permissionsRegistry;

    /**
     * @dev Communities' trusted minimal forwarder
     */
    address private immutable _relayer;

    /**
     * @dev Describes a sale on this contract
     */
    event CentralSale(
        address indexed community,
        address indexed purchaser,
        address indexed currency,
        uint256 price,
        uint256[] tokenIds
    );

    /**
     * @dev Reverts if msg.sender isn't the platform executor
     */
    modifier onlyPlatformExecutor() {
        require(IPermissionsRegistry(_permissionsRegistry).isPlatformExecutor(msg.sender), "Unauthorized");
        _;
    }

    /**
     * @dev Reverts if input currency isn't whitelisted on permissions registry
     */
    modifier currencyWhitelisted(address _currency) {
        require(
            IPermissionsRegistry(_permissionsRegistry).isCurrencyWhitelisted(_currency),
            "Currency not whitelisted"
        );
        _;
    }

    /**
     * @dev Set the permissions registry and community meta tx relayer
     */
    constructor(address permissionsRegistry, address relayer) {
        require(
            IERC165(permissionsRegistry).supportsInterface(type(IPermissionsRegistry).interfaceId),
            "Not a permissions registry"
        );

        _permissionsRegistry = permissionsRegistry;
        _relayer = relayer;
    }

    /**
     * @dev Purchase community tokens by sending payment to creator + platform, then by impersonating executor to transfer community tokens.
     * @param currency The ERC20 currency that the purchaser is paying in. Has to support meta transactions.
     * @param purchaser The purchaser
     * @param communityTokenTransferSignature Encoded function call to transfer community tokens from vault to purchaser
     * @param communityTokenTransferReq ForwardRequest object representing community token transfer
     * @param purchaseToCreatorPacket Meta tx packet containing call to send portion of purchase to creator
     * @param purchaseToPlatformPacket Meta tx packet containing call to send portion of purchase to platform
     */
    function purchaseTokenWithMetaTxSupportedCurrency(
        address currency,
        address purchaser,
        bytes calldata communityTokenTransferSignature,
        IMinimalForwarder.ForwardRequest calldata communityTokenTransferReq,
        PurchaserMetaTxPacket calldata purchaseToCreatorPacket,
        PurchaserMetaTxPacket calldata purchaseToPlatformPacket,
        uint256 price, // only used for emitting sale data (instead of extracting from packets)
        uint256[] calldata tokenIds // only used for emitting sale data (instead of extracting from packets)
    ) external onlyPlatformExecutor currencyWhitelisted(currency) {
        // transfer price amount of currency by hitting executeMetaTx on currency contract
        // the amount should be computed properly off-chain
        // transfer 97% to the creator
        INativeMetaTransaction(currency).executeMetaTransaction(
            purchaser,
            purchaseToCreatorPacket.functionSignature,
            purchaseToCreatorPacket.sigR,
            purchaseToCreatorPacket.sigS,
            purchaseToCreatorPacket.sigV
        );

        // transfer 3% to the vault
        INativeMetaTransaction(currency).executeMetaTransaction(
            purchaser,
            purchaseToPlatformPacket.functionSignature,
            purchaseToPlatformPacket.sigR,
            purchaseToPlatformPacket.sigS,
            purchaseToPlatformPacket.sigV
        );

        // transfer tokenAmounts of tokenIds on community, hit minimal forwarder
        IMinimalForwarder(_relayer).execute(communityTokenTransferReq, communityTokenTransferSignature);

        // emit sale params
        emit CentralSale(communityTokenTransferReq.to, purchaser, currency, price, tokenIds);
    }
}
