// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/**
 * @title NativeMetaTransaction interface
 * @author ishan@highlight.xyz
 */
interface INativeMetaTransaction {
    struct MetaTransaction {
        uint256 nonce;
        address from;
        bytes functionSignature;
    }

    function executeMetaTransaction(
        address userAddress,
        bytes memory functionSignature,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) external payable returns (bytes memory);
}
