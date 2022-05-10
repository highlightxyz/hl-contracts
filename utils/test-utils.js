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
  
function getMetaTxTypeData(chainId, verifyingContract) {
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
  
async function buildRequest(forwarder, input) {
    const nonce = await forwarder.getNonce(input.from).then(nonce => nonce.toString());
    return { value: 0, nonce, ...input };
}
  
async function buildTypedData(forwarder, request) {
    const chainId = await forwarder.provider.getNetwork().then(n => n.chainId);
    const typeData = getMetaTxTypeData(chainId, forwarder.address);
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
async function signMetaTxRequest(signer, forwarder, input) {
    const request = await buildRequest(forwarder, input);
    const toSign = await buildTypedData(forwarder, request);
    const signature = await signer._signTypedData(toSign.domain, toSign.types, toSign.message);
    return { signature, request };
}

module.exports = {
    arrayToNum,
    factorySetupCommunity,
    factorySetupCommunityWithClone,
    factorySetupCommunityWithRegisteredTM,
    factorySetupCommunityWithRegisteredClone,
    factoryDeployCommunity,
    factoryDeployCommunityReadManager,
    DEFAULT_ADMIN_ROLE,
    PLATFORM_ROLE,
    COMMUNITY_ADMIN_ROLE,
    OPENSEA_MAINNET_MARKETPLACE_POLYGON_ADDRESS,
    EIP1967AdminStorageSlot,
    EIP1967ImplementationStorageSlot,
    getUserDefinedNonce,
    incrementUserDefinedNonce,
    signMetaTxRequest,
    MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION, 
    COMMUNITY_DEPLOYED_TOPIC_HASH,
    TOKEN_MANAGER_DEPLOYED_TOPIC_HASH
}