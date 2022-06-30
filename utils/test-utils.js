const { ethers } = require("hardhat");
require('dotenv').config();

// replicated here for public-facing repo
const COMMUNITY_DEPLOYED_TOPIC_HASH = ethers.utils.id("CommunityDeployed(address)"); 
const TOKEN_MANAGER_DEPLOYED_TOPIC_HASH = ethers.utils.id("TokenManagerDeployed(address,address)");
const COMMUNITY_READ_MANAGER_DEPLOYED_TOPIC_HASH = ethers.utils.id("CommunityReadManagerDeployed(address,address)");

const BasicCommunityV1 = require("../artifacts/contracts/community/implementation/BasicCommunityV1.sol/BasicCommunityV1.json");
const BasicCommunityV1ABI = BasicCommunityV1["abi"];

const BasicTokenManager = require("../artifacts/contracts/token_manager/V2/implementation/BasicTokenManager2.sol/BasicTokenManager2.json");
const BasicTokenManagerABI = BasicTokenManager["abi"];

const CommunityReadManagerV1 = require("../artifacts/contracts/community/implementation/CommunityReadManagerV1.sol/CommunityReadManagerV1.json");
const CommunityReadManagerV1ABI = CommunityReadManagerV1["abi"];

const IGlobalTokenManager = require("../artifacts/contracts/token_manager/interfaces/IGlobalTokenManager.sol/IGlobalTokenManager.json");
const IGlobalTokenManagerABI = IGlobalTokenManager["abi"]

// increment on each deploy to avoid Create2 errors on tests. For normal usage, stick with USER_DEFINED_NONCE as 1 by default
let USER_DEFINED_NONCE = 1;

const OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS = "0x207Fa8Df3a17D96Ca7EA4f2893fcdCb78a304101";

const EIP1967AdminStorageSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const EIP1967ImplementationStorageSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"; 

const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const PLATFORM_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PLATFORM_ROLE"));
const COMMUNITY_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("COMMUNITY_ADMIN_ROLE"));

// converts array of ethers.BigNumber instances into array of javasript numbers
function arrayToNum(arr) {
    return arr.map(x => x.toNumber());
}

async function factorySetupCommunity(signer, factory, beacon, creatorAdmin, defaultAdmin, owner, royaltySecondaryController, communityName, contractURI) {
  const tx = await factory.setupCommunity(beacon.address, creatorAdmin, defaultAdmin, owner, royaltySecondaryController.address, communityName, contractURI, USER_DEFINED_NONCE);
  const receipt = await tx.wait();

  USER_DEFINED_NONCE++;

  return processReceipt(receipt, signer);
}

async function factorySetupCommunityWithRegisteredTM(signer, factory, beacon, creatorAdmin, defaultAdmin, owner, royaltySecondaryController, communityName, contractURI) {  
  const tx = await factory.setupCommunityWithRegisteredTokenManager(beacon.address, creatorAdmin, defaultAdmin, owner, royaltySecondaryController.address, communityName, contractURI, USER_DEFINED_NONCE);
  const receipt = await tx.wait();

  USER_DEFINED_NONCE++;

  return processReceipt(receipt, signer);
}

async function factorySetupCommunityWithGlobalDefaultTMs(signer, factory, beacon, creatorAdmin, defaultAdmin, owner, royaltySecondaryController, communityName, contractURI) {  
  const tx = await factory.setupCommunityWithGlobalDefaultTokenManagers(beacon.address, creatorAdmin, defaultAdmin, owner, royaltySecondaryController.address, communityName, contractURI, USER_DEFINED_NONCE);
  const receipt = await tx.wait();

  USER_DEFINED_NONCE++;

  const { deployedCommunity, deployedCommunityReadManager } = processReceipt(receipt, signer);
  return {
    deployedCommunity, 
    deployedCommunityReadManager,
    globalTms: (await factory.getDefaultRegisteredTokenManagers()).map(tokenManagerAddress => new ethers.Contract(tokenManagerAddress, IGlobalTokenManagerABI, signer))
  }
}

async function factorySetupCommunityWithClone(signer, factory, beacon, creatorAdmin, defaultAdmin, owner, royaltySecondaryController, communityName, contractURI) {
  const tx = await factory.setupCommunityWithClone(beacon.address, creatorAdmin, defaultAdmin, owner, royaltySecondaryController.address, communityName, contractURI, USER_DEFINED_NONCE);
  const receipt = await tx.wait();

  USER_DEFINED_NONCE++;

  return processReceipt(receipt, signer);
}

async function factorySetupCommunityWithRegisteredClone(signer, factory, beacon, creatorAdmin, defaultAdmin, owner, royaltySecondaryController, communityName, contractURI) {  
  const tx = await factory.setupCommunityWithRegisteredClone(beacon.address, creatorAdmin, defaultAdmin, owner, royaltySecondaryController.address, communityName, contractURI, USER_DEFINED_NONCE);
  const receipt = await tx.wait();

  USER_DEFINED_NONCE++;

  return processReceipt(receipt, signer);
}

async function factoryDeployCommunity(signer, factory, beacon, defaultAdmin, creatorAdmin, owner, communityName) {  
  const tx = await factory.deployCommunity(beacon.address, creatorAdmin, defaultAdmin, owner, communityName, USER_DEFINED_NONCE);
  const receipt = await tx.wait();

  USER_DEFINED_NONCE++;

  return processReceipt(receipt, signer);
}

async function factoryDeployCommunityReadManager(signer, factory, communityAddress) {
  const tx = await factory.deployCommunityReadManagerV1(communityAddress);
  const receipt = await tx.wait();

  return processReceipt(receipt, signer);
}

function processReceipt(receipt, signer) {
  var tokenManagerAddress = "";
  var communityAddress = "";
  var communityReadManagerAddress = "";

  for (const log of receipt.logs) {
    if (log.topics[0] == COMMUNITY_DEPLOYED_TOPIC_HASH) {
      communityAddress = "0x" + log.topics[1].slice(26);
    } else if (log.topics[0] == TOKEN_MANAGER_DEPLOYED_TOPIC_HASH) {
      tokenManagerAddress = "0x" + log.topics[1].slice(26);
    } else if (log.topics[0] == COMMUNITY_READ_MANAGER_DEPLOYED_TOPIC_HASH) {
      communityReadManagerAddress = "0x" + log.topics[1].slice(26);
    }
  }

  const deployedCommunity = communityAddress != "" ? new ethers.Contract(communityAddress, BasicCommunityV1ABI, signer) : null;
  const deployedBasicTm = tokenManagerAddress != "" ? new ethers.Contract(tokenManagerAddress, BasicTokenManagerABI, signer) : null;
  const deployedCommunityReadManager = communityReadManagerAddress != "" ? new ethers.Contract(communityReadManagerAddress, CommunityReadManagerV1ABI, signer) : null;

  return {
      deployedCommunity,
      deployedBasicTm,
      deployedCommunityReadManager
  }
}

function getUserDefinedNonce() {
  return USER_DEFINED_NONCE;
}

function incrementUserDefinedNonce() {
  USER_DEFINED_NONCE++;
}

async function deployCommunityFactory2(
  proxyAdminOwner,
  splitMainTrustedForwarder, 
  _communityTrustedForwarder,
  initialPlatformExecutor,
  permissionsRegistryAdmin,
  platformVault,
  defaultRegisteredTokenManagers,
  initialFactoryOwner
) {
  const OldCommunityFactory = await ethers.getContractFactory("CommunityFactory");
  const CommunityFactory = await ethers.getContractFactory("CommunityFactoryV2");

  const oldFactory = await OldCommunityFactory.deploy(
    proxyAdminOwner,
    splitMainTrustedForwarder, 
    _communityTrustedForwarder,
    initialPlatformExecutor,
    permissionsRegistryAdmin,
    platformVault
  );
  await oldFactory.deployed();

  const splitMainAddress = await oldFactory.splitMain();
  const proxyAdminAddress = await oldFactory.proxyAdmin();
  const permissionsRegistryAddress = await oldFactory.permissionsRegistry();
  const communityTrustedForwarderAddress =await oldFactory.communityTrustedForwarder();

  const factory = await CommunityFactory.deploy(
    initialFactoryOwner,
    splitMainAddress,
    proxyAdminAddress,
    permissionsRegistryAddress,
    communityTrustedForwarderAddress,
    defaultRegisteredTokenManagers
  )
  await factory.deployed();

  return factory;
}

async function deployGlobalBasicTokenManager() {
  const GlobalBasicTokenManager = await ethers.getContractFactory("GlobalBasicTokenManager");
  const globalBasicTokenManager = await GlobalBasicTokenManager.deploy();
  await globalBasicTokenManager.deployed();
  return globalBasicTokenManager;
}

async function deployNonTransferableTokenManager() {
  const NonTransferableTokenManager = await ethers.getContractFactory("NonTransferableTokenManager");
  const nonTransferableTokenManager = await NonTransferableTokenManager.deploy();
  await nonTransferableTokenManager.deployed();
  return nonTransferableTokenManager;
}

// metatx utilities replicated here for public release

const MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION = 100000;
  
const ForwardRequest = [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'gas', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'data', type: 'bytes' },
];

const MetaTransaction = [
  { name: 'nonce', type: 'uint256' },
  { name: 'from', type: 'address' },
  { name: 'functionSignature', type: 'bytes' }
];
  
function get2771MetaTxTypeData(chainId, verifyingContract) {
    return {
        types: {
           // EIP712Domain, do not pass EIP712Domain type into ethers, it will pre-compute for us
            ForwardRequest,
        },
        domain: {
            name: 'MinimalForwarder',
            version: '0.0.1',
            chainId,
            verifyingContract,
        },
        primaryType: 'ForwardRequest',
    }
};
  
async function build2771Request(forwarder, input) {
    const nonce = await forwarder.getNonce(input.from).then(nonce => nonce.toString());
    return { value: 0, nonce, ...input };
}
  
async function build2771TypedData(forwarder, request) {
    const chainId = await forwarder.provider.getNetwork().then(n => n.chainId);
    const typeData = get2771MetaTxTypeData(chainId, forwarder.address);
    return { ...typeData, message: request };
}
  
/* expect input to look like:
{
    from, // signer address
    to, // contract being called
    gas, // expected gas units for operation
    data // encoded function call on contract with arguments
}
*/
async function sign2771MetaTxRequest(signer, forwarder, input) {
    const request = await build2771Request(forwarder, input);
    const toSign = await build2771TypedData(forwarder, request);
    const signature = await signer._signTypedData(toSign.domain, toSign.types, toSign.message);
    return { signature, request };
}

class WETHMetaTx {
  constructor(contract) {
    this.contract = contract;
    this.META_TRANSACTION_TYPEHASH =
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MetaTransaction(uint256 nonce,address from,bytes functionSignature)"));
    this.EIP712_DOMAIN_TYPEHASH = 
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)"))
  }

  getWETHMetaTxTypeData() {
    return {
      types: {
         // EIP712Domain, do not pass EIP712Domain type into ethers, it will pre-compute for us
          MetaTransaction,
      },
      domain: {
          name: 'Wrapped Ether',
          version: '1',
          verifyingContract: this.contract.address,
          salt: this.chainIdBytes
      },
      primaryType: 'MetaTransaction',
    }
  } 

  async buildWETHMetaTransaction(from, functionSignature, nonce) {
    if (!nonce) {
      nonce = await this.contract.getNonce(from).then(nonce => nonce.toString());
    } else {
      nonce = nonce.toString();
    }
    return { nonce, from, functionSignature };
  }
  
  async buildWETHTypedData(metaTx) {
    this.chainIdBytes = ethers.utils.hexZeroPad(ethers.utils.hexlify(await this.contract.provider.getNetwork().then(n => n.chainId)), 32);
    const typeData = this.getWETHMetaTxTypeData();
    return { ...typeData, message: metaTx };
  }
  
  async signWETHMetaTxRequest(signer, from, functionSignature, nonce = undefined) {
    const metaTx = await this.buildWETHMetaTransaction(from, functionSignature, nonce);
    const toSign = await this.buildWETHTypedData(metaTx);
    const signature = await signer._signTypedData(toSign.domain, toSign.types, toSign.message);
    const { r, s, v } = ethers.utils.splitSignature(signature);
    return { functionSignature, sigR: r, sigS: s, sigV: v };
  }
  
  verify(signer, metaTx, signature) {
    const recoveredSigner = this.ecrecover(this.toTypedMessageHash(this.hashMetaTransaction(metaTx)), signature);
    return signer == recoveredSigner;
  }
  
  hashMetaTransaction(metaTx) {
    const hashedMetaTx = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "uint256", "address", "bytes32"],
        [this.META_TRANSACTION_TYPEHASH, parseInt(metaTx.nonce), metaTx.from, ethers.utils.keccak256(metaTx.functionSignature)]
      )
    )
  
    return hashedMetaTx;
  }
  
  toTypedMessageHash(hashedMetaTx) {
    const typedMessageHash = ethers.utils.keccak256(
      ethers.utils.solidityPack(["string", "bytes32", "bytes32"], ["\x19\x01", this.getDomainSeperator(), hashedMetaTx])
    )
  
    return typedMessageHash;
  }
  
  getDomainSeperator() {
    const domainSeperator = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "bytes32", "address", "bytes32"],
        [
          this.EIP712_DOMAIN_TYPEHASH, 
          ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Wrapped Ether")),
          ethers.utils.keccak256(ethers.utils.toUtf8Bytes("1")),
          this.contract.address,
          this.chainIdBytes
        ]
      )
    )
  
    return domainSeperator;
  }
  
  ecrecover(typedMessageHash, signature) {
    return ethers.utils.recoverAddress(typedMessageHash, signature);
  }  
}

module.exports = {
    arrayToNum,
    factorySetupCommunity,
    factorySetupCommunityWithClone,
    factorySetupCommunityWithRegisteredTM,
    factorySetupCommunityWithGlobalDefaultTMs,
    factorySetupCommunityWithRegisteredClone,
    factoryDeployCommunity,
    factoryDeployCommunityReadManager,
    deployCommunityFactory2,
    deployGlobalBasicTokenManager, 
    deployNonTransferableTokenManager,
    DEFAULT_ADMIN_ROLE,
    PLATFORM_ROLE,
    COMMUNITY_ADMIN_ROLE,
    OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS,
    EIP1967AdminStorageSlot,
    EIP1967ImplementationStorageSlot,
    getUserDefinedNonce,
    incrementUserDefinedNonce,
    sign2771MetaTxRequest,
    WETHMetaTx,
    MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION, 
    COMMUNITY_DEPLOYED_TOPIC_HASH,
    TOKEN_MANAGER_DEPLOYED_TOPIC_HASH
}