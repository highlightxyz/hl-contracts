// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "../token_manager/V2/implementation/BasicTokenManager2.sol";
import "../token_manager/V2/implementation/BasicTokenManagerUpgradeable2.sol";
import "./interfaces/ICommunity.sol";
import "./interfaces/ICommunityAdmin.sol";
import "./implementation/CommunityReadManagerV1.sol";
import "./BeaconProxy.sol";
import "./interfaces/ICommunityReadManager.sol";
import "../utils/IAccessControlUpgradeable.sol";
import "../royalties/SplitMain.sol";
import "../royalties/interfaces/ISplitMain.sol";
import "../utils/Create2.sol";
import "../utils/Proxy/ProxyAdmin.sol";
import "../permissions_registry/PermissionsRegistry.sol";

/**
 * @title Highlight community factory
 * @author ishan@highlight.xyz
 * @dev Used to setup and deploy communities in various configurations
 */
contract CommunityFactory {
    /**
     * @dev BasicTokenManager implementation used by TokenManager clones
     */
    address public immutable basicTokenManagerImplementation;

    /**
     * @dev SplitMain (royalties) used for system. Is TransparentUpgradeableProxy
     */
    address public immutable splitMain;

    /**
     * @dev SplitMain (royalties) and PermissionsRegistry proxy admin
     */
    address public immutable proxyAdmin;

    /**
     * @dev Permission registry for system. Is TransparentUpgradeableProxy
     */
    address public immutable permissionsRegistry;

    /**
     * @dev Trusted meta tx relayer for community contracts
     */
    address public immutable communityTrustedForwarder;

    /**
     * @notice Emitted when community is deployed
     * @param community Deployed community
     */
    event CommunityDeployed(address indexed community);

    /**
     * @notice Emitted when token manager is deployed
     * @param tokenManager Deployed token manager
     * @param community Associated community
     */
    event TokenManagerDeployed(address indexed tokenManager, address indexed community);

    /**
     * @notice Emitted when community read manager is deployed
     * @param communityManager Deployed community read manager
     * @param community Associated community
     */
    event CommunityReadManagerDeployed(address indexed communityManager, address indexed community);

    /**
     * @dev Instantiates token manager implementation
     * @param proxyAdminOwner Owner of proxy admin contract that can upgrade SplitMain and PermissionsRegistry
     * @param splitMainTrustedForwarder Trusted meta tx relayer for SplitMain
     * @param _communityTrustedForwarder Trusted meta tx relayer for communities
     * @param initialPlatformExecutor Initial Highlight platform executor
     * @param permissionsRegistryAdmin The administrator of the permissions registry, can swap the platform executor
     * @param platformVault The vault used for token distribution in beta
     */
    constructor(
        address proxyAdminOwner,
        address splitMainTrustedForwarder,
        address _communityTrustedForwarder,
        address initialPlatformExecutor,
        address permissionsRegistryAdmin,
        address platformVault
    ) public {
        basicTokenManagerImplementation = address(new BasicTokenManagerUpgradeable2());
        proxyAdmin = address(new ProxyAdmin());
        OwnableUpgradeable(proxyAdmin).transferOwnership(proxyAdminOwner);

        address splitMainImplementation = address(new SplitMain());
        splitMain = address(
            new TransparentUpgradeableProxy(
                splitMainImplementation,
                proxyAdmin,
                abi.encodeWithSelector(ISplitMain(address(0)).initialize.selector, splitMainTrustedForwarder)
            )
        );

        address permissionsRegistryImplementation = address(new PermissionsRegistry());
        permissionsRegistry = address(
            new TransparentUpgradeableProxy(
                permissionsRegistryImplementation,
                proxyAdmin,
                abi.encodeWithSelector(
                    IPermissionsRegistry(address(0)).initialize.selector,
                    initialPlatformExecutor,
                    platformVault
                )
            )
        );
        OwnableUpgradeable(permissionsRegistry).transferOwnership(permissionsRegistryAdmin);

        communityTrustedForwarder = _communityTrustedForwarder;
    }

    /**
     * @dev Deploys community proxy, and deploys basic token manager
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _defaultAdmin Default admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _platformRoyaltySecondaryController Platform's initial secondary controller of royalty split
     * @param _communityName Name of community
     * @param _contractURI Community contract uri
     * @param userDefinedNonce User defined nonce used to bypass Create2 error
     */
    function setupCommunity(
        address _beacon,
        address _creatorAdmin,
        address _defaultAdmin,
        address _owner,
        address _platformRoyaltySecondaryController,
        string calldata _communityName,
        string calldata _contractURI,
        uint256 userDefinedNonce
    ) external returns (address, address) {
        address newBasicCommunity = deployCommunity(
            _beacon,
            _creatorAdmin,
            address(this),
            _owner,
            _communityName,
            userDefinedNonce
        );
        _setCommunityReadManager(newBasicCommunity);
        // set contract uri after the fact, because contract uri should not be encoded into create2 contract creation bytecode
        // using create2 to predict the royalty split address to encode into the contract uri, which relies on the community contract address, which is also predicted
        _setContractURI(newBasicCommunity, _contractURI);
        _setRoyaltySplit(newBasicCommunity, _creatorAdmin, _defaultAdmin, _platformRoyaltySecondaryController);

        address newTokenManager = deployBasicTokenManager(newBasicCommunity);

        IAccessControlUpgradeable(newBasicCommunity).revokeRole(keccak256("PLATFORM_ROLE"), address(this));
        ICommunityAdmin(newBasicCommunity).swapDefaultAdmin(_defaultAdmin);

        return (newBasicCommunity, newTokenManager);
    }

    /**
     * @dev Deploys community proxy, deploys basic token manager, and registers token manager on community
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _defaultAdmin Default admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _platformRoyaltySecondaryController Platform's initial secondary controller of royalty split
     * @param _communityName Name of community
     * @param _contractURI Community contract uri
     * @param userDefinedNonce User defined nonce used to bypass Create2 error
     */
    function setupCommunityWithRegisteredTokenManager(
        address _beacon,
        address _creatorAdmin,
        address _defaultAdmin,
        address _owner,
        address _platformRoyaltySecondaryController,
        string calldata _communityName,
        string calldata _contractURI,
        uint256 userDefinedNonce
    ) external returns (address, address) {
        address newBasicCommunity = deployCommunity(
            _beacon,
            _creatorAdmin,
            address(this),
            _owner,
            _communityName,
            userDefinedNonce
        );
        _setCommunityReadManager(newBasicCommunity);
        // set contract uri after the fact, because contract uri should not be encoded into create2 contract creation bytecode
        // using create2 to predict the royalty split address to encode into the contract uri, which relies on the community contract address, which is also predicted
        _setContractURI(newBasicCommunity, _contractURI);
        _setRoyaltySplit(newBasicCommunity, _creatorAdmin, _defaultAdmin, _platformRoyaltySecondaryController);

        address newTokenManager = deployBasicTokenManager(newBasicCommunity);

        ICommunity(newBasicCommunity).registerTokenManager(newTokenManager);

        IAccessControlUpgradeable(newBasicCommunity).revokeRole(keccak256("PLATFORM_ROLE"), address(this));
        ICommunityAdmin(newBasicCommunity).swapDefaultAdmin(_defaultAdmin);

        return (newBasicCommunity, newTokenManager);
    }

    /**
     * @dev Deploys community proxy, and deploys basic token manager clone
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _defaultAdmin Default admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _platformRoyaltySecondaryController Platform's initial secondary controller of royalty split
     * @param _communityName Name of community
     * @param _contractURI Community contract uri
     * @param userDefinedNonce User defined nonce used to bypass Create2 error
     */
    function setupCommunityWithClone(
        address _beacon,
        address _creatorAdmin,
        address _defaultAdmin,
        address _owner,
        address _platformRoyaltySecondaryController,
        string calldata _communityName,
        string calldata _contractURI,
        uint256 userDefinedNonce
    ) external returns (address, address) {
        address newBasicCommunity = deployCommunity(
            _beacon,
            _creatorAdmin,
            address(this),
            _owner,
            _communityName,
            userDefinedNonce
        );
        _setCommunityReadManager(newBasicCommunity);
        // set contract uri after the fact, because contract uri should not be encoded into create2 contract creation bytecode
        // using create2 to predict the royalty split address to encode into the contract uri, which relies on the community contract address, which is also predicted
        _setContractURI(newBasicCommunity, _contractURI);
        _setRoyaltySplit(newBasicCommunity, _creatorAdmin, _defaultAdmin, _platformRoyaltySecondaryController);

        address newTokenManager = deployBasicTokenManagerClone(newBasicCommunity);

        IAccessControlUpgradeable(newBasicCommunity).revokeRole(keccak256("PLATFORM_ROLE"), address(this));
        ICommunityAdmin(newBasicCommunity).swapDefaultAdmin(_defaultAdmin);

        return (newBasicCommunity, newTokenManager);
    }

    /**
     * @dev Deploys community proxy, deploys basic token manager clone, and registers clone on community
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _defaultAdmin Default admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _platformRoyaltySecondaryController Platform's initial secondary controller of royalty split
     * @param _communityName Name of community
     * @param _contractURI Community contract uri
     * @param userDefinedNonce User defined nonce used to bypass Create2 error
     */
    function setupCommunityWithRegisteredClone(
        address _beacon,
        address _creatorAdmin,
        address _defaultAdmin,
        address _owner,
        address _platformRoyaltySecondaryController,
        string calldata _communityName,
        string calldata _contractURI,
        uint256 userDefinedNonce
    ) external returns (address, address) {
        address newBasicCommunity = deployCommunity(
            _beacon,
            _creatorAdmin,
            address(this),
            _owner,
            _communityName,
            userDefinedNonce
        );
        _setCommunityReadManager(newBasicCommunity);
        // set contract uri after the fact, because contract uri should not be encoded into create2 contract creation bytecode
        // using create2 to predict the royalty split address to encode into the contract uri, which relies on the community contract address, which is also predicted
        _setContractURI(newBasicCommunity, _contractURI);
        _setRoyaltySplit(newBasicCommunity, _creatorAdmin, _defaultAdmin, _platformRoyaltySecondaryController);

        address newTokenManager = deployBasicTokenManagerClone(newBasicCommunity);

        ICommunity(newBasicCommunity).registerTokenManager(newTokenManager);

        IAccessControlUpgradeable(newBasicCommunity).revokeRole(keccak256("PLATFORM_ROLE"), address(this));
        ICommunityAdmin(newBasicCommunity).swapDefaultAdmin(_defaultAdmin);

        return (newBasicCommunity, newTokenManager);
    }

    /**
     * @dev Deploys community proxy
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _defaultAdmin Platform admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _communityName Name of community
     * @param userDefinedNonce User defined nonce used to bypass Create2 error
     */
    function deployCommunity(
        address _beacon,
        address _creatorAdmin,
        address _defaultAdmin,
        address _owner,
        string calldata _communityName,
        uint256 userDefinedNonce
    ) public returns (address) {
        address newCommunity = Create2.deploy(
            0,
            _hashCommunityInputs(userDefinedNonce),
            _createBeaconProxyBytecode(
                _beacon,
                _creatorAdmin,
                _defaultAdmin,
                _owner,
                _communityName,
                communityTrustedForwarder
            )
        );
        emit CommunityDeployed(newCommunity);
        return newCommunity;
    }

    /**
     * @dev Deploys basic token manager
     * @param _community Associated community of token manager
     */
    function deployBasicTokenManager(address _community) public returns (address) {
        address newBasicTokenManager = address(new BasicTokenManager2(_community));
        emit TokenManagerDeployed(newBasicTokenManager, _community);
        return newBasicTokenManager;
    }

    /**
     * @dev Deploys basic token manager clone
     * @param _community Associated community of token manager
     */
    function deployBasicTokenManagerClone(address _community) public returns (address) {
        address clone = Clones.clone(basicTokenManagerImplementation);
        BasicTokenManagerUpgradeable2(clone).initialize(_community);
        emit TokenManagerDeployed(clone, _community);
        return clone;
    }

    /**
     * @dev Deploys community read manager v1
     * @param _community Associated community
     */
    function deployCommunityReadManagerV1(address _community) public returns (address) {
        address newCommunityReadManager = address(new CommunityReadManagerV1(_community));
        emit CommunityReadManagerDeployed(newCommunityReadManager, _community);
        return newCommunityReadManager;
    }

    /**
     * @dev Computes royalty split address for community that isn't created yet, by first computing community address.
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _platformAdmin Platform admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _platformRoyaltySecondaryController Platform's initial secondary controller of royalty split
     * @param _communityName Name of community
     * @param userDefinedNonce User modulated nonce that enables caller to deploy multiple communities with same input
     */
    function predictRoyaltySplitAddress(
        address _beacon,
        address _creatorAdmin,
        address _platformAdmin,
        address _owner,
        address _platformRoyaltySecondaryController,
        string calldata _communityName,
        uint256 userDefinedNonce
    ) public view returns (address) {
        address[] memory _secondaryAccounts = new address[](1);
        address[] memory _secondaryControllers = new address[](2);
        uint32[] memory _secondaryAllocations = new uint32[](1);
        _secondaryAccounts[0] = _creatorAdmin;
        _secondaryControllers[0] = _platformRoyaltySecondaryController;
        _secondaryControllers[1] = _creatorAdmin;
        _secondaryAllocations[0] = 700000; // 70% of total royalty share to secondary

        return
            ISplitMain(splitMain).predictSplitAddress(
                ISplitMain.Split(
                    1,
                    300000, // 30% of total royalty share to primary
                    0,
                    _secondaryAllocations,
                    _platformAdmin,
                    _secondaryControllers,
                    _secondaryAccounts
                ), // this is the default split created by this factory during the deploy process
                predictSetupCommunityAddress(_beacon, _creatorAdmin, _owner, _communityName, userDefinedNonce)
            );
    }

    /**
     * @dev Computes expected community address that is generated via a setupCommunity function based on input.
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _communityName Name of community
     * @param userDefinedNonce User modulated nonce that enables caller to deploy multiple communities with same input
     */
    function predictSetupCommunityAddress(
        address _beacon,
        address _creatorAdmin,
        address _owner,
        string calldata _communityName,
        uint256 userDefinedNonce
    ) public view returns (address) {
        return
            predictDeployedCommunityAddress(
                _beacon,
                _creatorAdmin,
                address(this),
                _owner,
                _communityName,
                userDefinedNonce
            );
    }

    /**
     * @dev Computes expected community address that is generated via the deployCommunity function based on input.
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _defaultAdmin Platform admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _communityName Name of community
     * @param userDefinedNonce User modulated nonce that enables caller to deploy multiple communities with same input
     */
    function predictDeployedCommunityAddress(
        address _beacon,
        address _creatorAdmin,
        address _defaultAdmin,
        address _owner,
        string calldata _communityName,
        uint256 userDefinedNonce
    ) public view returns (address) {
        return
            Create2.computeAddress(
                _hashCommunityInputs(userDefinedNonce),
                keccak256(
                    _createBeaconProxyBytecode(
                        _beacon,
                        _creatorAdmin,
                        _defaultAdmin,
                        _owner,
                        _communityName,
                        communityTrustedForwarder
                    )
                )
            );
    }

    /**
     * @dev Deploy and set community read manager on community to CommunityReadManagerV1
     * @param _community The community to set the community manager on
     */
    function _setCommunityReadManager(address _community) internal {
        address _communityManager = deployCommunityReadManagerV1(_community);
        ICommunity(_community).setCommunityReadManager(_communityManager);
    }

    /**
     * @dev Set community metadata (contract uri)
     * @param newBasicCommunity The community to set the community metadata on
     * @param _contractURI Holds community metadata
     */
    function _setContractURI(address newBasicCommunity, string calldata _contractURI) internal {
        ICommunity(newBasicCommunity).setContractMetadata(true, false, _contractURI, "");
    }

    /**
     * @dev Deploys and sets the royalty split contract on a contract
     * @param newBasicCommunity The community to set the royalty split on
     * @param _creatorAdmin Creator admin of community
     * @param _primaryRoyaltyController Primary controller of royalty split
     * @param _platformRoyaltySecondaryController Platform's initial secondary controller of royalty split
     */
    function _setRoyaltySplit(
        address newBasicCommunity,
        address _creatorAdmin,
        address _primaryRoyaltyController,
        address _platformRoyaltySecondaryController
    ) internal {
        address[] memory _secondaryAccounts = new address[](1);
        address[] memory _secondaryControllers = new address[](2);
        uint32[] memory _secondaryAllocations = new uint32[](1);
        _secondaryAccounts[0] = _creatorAdmin;
        _secondaryControllers[0] = _platformRoyaltySecondaryController;
        _secondaryControllers[1] = _creatorAdmin;
        _secondaryAllocations[0] = 700000; // 70% of total royalty share to secondary
        ICommunity(newBasicCommunity).setRoyaltySplit(
            ISplitMain(splitMain),
            _secondaryAccounts,
            300000, // 30% of total royalty share to primary
            _secondaryAllocations,
            0,
            _primaryRoyaltyController,
            _secondaryControllers,
            1000 // default to 10% as total royalty cut
        );
    }

    /**
     * @dev Generates the bytecode passed into the beacon proxy constructor.
     * @param _beacon Beacon the community proxy will point to
     * @param _creatorAdmin Creator admin of community
     * @param _defaultAdmin Platform admin of community
     * @param _owner "Owner" of community, used to administrate collections on external marketplaces
     * @param _communityName Name of community
     * @param _trustedForwarder Trusted meta tx relayer for community
     */
    function _createBeaconProxyBytecode(
        address _beacon,
        address _creatorAdmin,
        address _defaultAdmin,
        address _owner,
        string calldata _communityName,
        address _trustedForwarder
    ) internal view returns (bytes memory) {
        bytes memory bytecode = type(BeaconProxy).creationCode;

        // this is encoding the arguments to the beacon proxy constructor in the beacon proxy contract creation bytecode
        // the arguments are the beacon address and the bytes containing the call to initialize on the community
        // the bytes containing the call has to be encoded as well
        // end up with 3 layers of encoding
        return
            abi.encodePacked(
                bytecode,
                abi.encode(
                    _beacon,
                    abi.encodeWithSelector(
                        ICommunity(address(0)).initialize.selector,
                        _creatorAdmin,
                        _defaultAdmin,
                        permissionsRegistry,
                        _owner,
                        _communityName,
                        _trustedForwarder
                    )
                )
            );
    }

    /**
     * @dev Hashes community inputs. Used to deterministically generate address, used offchain to predict addres.
     * @param userDefinedNonce Nonce user can set to vary input and bypass duplicate Create2 error
     */
    function _hashCommunityInputs(uint256 userDefinedNonce) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(userDefinedNonce));
    }
}
