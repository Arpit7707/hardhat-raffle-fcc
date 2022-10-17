const { network, ethers } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

const BASE_FEE = "250000000000000000" //ethers.utils.parseEther("0.25") //0.25 iss the premium. It costs 0.25 INK per request //https://docs.chain.link/docs/vrf/v2/subscription/supported-netwo
const GAS_PRICE_LINK = 1e9 // 1000000000//link per gas.calculated value based o the gas price of chain

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = getNamedAccounts()
    const chainId = network.config.chainId
    // const args = [BASE_FEE, GAS_PRICE_LINK]

    if (chainId == 31337) {
        log("Local network detected! Deploying Mock...")
    }
    //deploy mock vrfCoordinator coz for localhost and hardhat there is no vrfCoordinator contract
    await deploy("VRFCoordinatorV2Mock", {
        from: deployer,
        log: true,
        args: [BASE_FEE, GAS_PRICE_LINK],
    })
    log("MOCK DEPOYED......!")
    log("------------------------------------")
}

module.exports.tags = ["all", "mocks"]
