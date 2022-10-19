const { network, ethers } = require("hardhat")
const { developementChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("30")

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subscriptionId

    //setting vrfCoordinatorV2Address for deploying network
    if (chainId == 31337) {
        const vrfCoordiantorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") //importing mock in case of deploying on hardhat and localhost
        vrfCoordinatorV2Address = vrfCoordiantorV2Mock.address
        //getting sunscriptionId in case of localhost and hardhat network deployment
        const transactionResponse = await vrfCoordiantorV2Mock.createSubscription() //creating subscription
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId

        //Fund the subscription
        //Usually, you'd need the link token on a real network
        await vrfCoordiantorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasimit = networkConfig[chainId]["callbackGasimit"]
    const interval = networkConfig[chainId]["interval"]

    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscriptionId,
        callbackGasimit,
        interval,
    ]

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args, //args are arguments we need to send to constructor of Raffle.sol while deploying the contract
        log: true,
        waitConformations: network.config.blockConformations || 1,
    })

    if (developementChains.includes(network.name)) {
        const vrfCoordinatorV2 = await ethers.getContract("VRFCoordinatorV2Mock")
        await vrfCoordinatorV2.addConsumer(subscriptionId, raffle.address)
    }

    if (!chainId == 31337 && process.env.ETHERSCAN_API_KEY) {
        log("Verifying....")
        await verify(raffle.address, args)
    }

    log("-----------------------------------------------")
}

module.exports.tags = ["all", "raffle"]
