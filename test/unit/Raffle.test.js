const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developementChains, networkConfig } = require("../../helper-hardhat-config")

!developementChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", async function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"]) //to deploy all contracts with tag "all"
              raffle = await ethers.getContract("Raffle", deployer) // Returns a new connection to the Raffle contract
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") // Returns a new connection to the VRFCoordinatorV2Mock contract
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", async function () {
              it("initialize the raffle contract correctly", async function () {
                  //Ideally we make out tests have just 1 assert per "it"
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterRaffle", async function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered()"
                  )
              })
              it("records player when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayers(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("emits event when enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("dosen't allow entrance when raffle is calculating", async function () {
                  //following three lines are used to make checkUpKeep true
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) //increase the time of our blockchain by the interval
                  await network.provider.send("evm_mine", []) //to mine one block
                  //we pretend to be chainlink keeper
                  await raffle.performUpkeep([]) //now rafflestate is: calculating
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle_NotOpen"
                  )
              })
          })

          describe("checkUpkeep", async function () {
              it("returns false if people haven't send any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  //callstatic is used to simulate sending transaction to any public function, checkUpkeep in this case
                  assert(!upKeepNeeded)
              })
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([]) //"0x0" == [] , passing empty byte string //now rafflestate is: calculating
                  const raffleState = await raffle.getRaffleState()
                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upKeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upKeepNeeded } = await raffle.callStatic.checkUpkeep([]) // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upKeepNeeded)
              })
          })
          describe("performUpkeep", async function () {
              it("it can only run is checkUpKeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("reverts when checkUpKeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle_UpKeepNotNeeded"
                  )
              })
              it("updates the raffleState and emits the event, and calls the vrfCoordinator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  //getting requestId from transaction receipt
                  const txResponse = await raffle.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.RequestId

                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0) //checking for emittion of events
                  assert.equal(raffleState.toString(), "1") //checking for updation of  raffleState
              })
          })
          describe("fulfilRandomWords", async function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })
          })
          it("can only be called after performUpKeep", async function () {
              await expect(
                  vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
              ).to.be.revertedWith("nonexistent request")
              await expect(
                  vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
              ).to.be.revertedWith("nonexistent request")
          })

          // This test is too big...
          // This test simulates users entering the raffle and wraps the entire functionality of the raffle
          // inside a promise that will resolve if everything is successful.
          // An event listener for the WinnerPicked is set up
          // Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
          // All the assertions are done once the WinnerPicked event is fired
          it("picks a winner, resets the lottery, and sends money", async () => {
              const additionalEntrances = 3
              const startingAccountIndex = 1 //deployer = 0

              const accounts = await ethers.getSigners()

              for (
                  let i = startingAccountIndex;
                  i < startingAccountIndex + additionalEntrances;
                  i++
              ) {
                  const accountsConnectedRaffle = raffle.connect(accounts[i])
                  await accountsConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
              }

              const startingTimeStamp = await raffle.getLatestTimeStamp()

              //performUpKeep (mock being chainlink Keepers)
              //fulfilRandomWords (mock being the chainlink VRF)
              //we will have to wait for the fulfillRandomWords to be called

              await new Promise(async (resolve, reject) => {
                  raffle.once("winnerPicked", async () => {
                      // event listener for WinnerPicked
                      console.log("WinnerPicked event fired!")
                      // assert throws an error if it fails, so we need to wrap
                      // it in a try/catch so that the promise returns event
                      // if it fails.
                      try {
                          const recentWinner = await raffle.getRecentWinner()
                          //   console.log(recentWinner)

                          //   console.log(accounts[2].address)
                          //   console.log(accounts[0].address)
                          //   console.log(accounts[1].address)
                          //   console.log(accounts[3].address)

                          const raffleState = await raffle.getRaffleState()
                          const winnerBalance = await accounts[2].getBalance()
                          const endingTimeStamp = await raffle.getLatestTimeStamp()
                          const numPlayers = await raffle.getNumberOfPlayers()

                          assert.equal(recentWinner.toString(), accounts[2].address)

                          assert.equal(numPlayers.toString(), "0")
                          assert.equal(raffleState, 0)

                          assert.equal(
                              winnerBalance.toString(),
                              startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                  .add(
                                      raffleEntranceFee
                                          .mul(additionalEntrances)
                                          .add(raffleEntranceFee)
                                  )
                                  .toString()
                          )
                          assert(endingTimeStamp > startingTimeStamp)
                          resolve()
                      } catch (e) {
                          reject(e)
                      }
                      resolve()
                  })
                  //setting up lisstener
                  //below, we will fire the events, and the listener will pick it up and resolve

                  const tx = await raffle.performUpkeep("0x")

                  const txReceipt = await tx.wait(1)
                  const startingBalance = await accounts[2].getBalance()

                  await vrfCoordinatorV2Mock.fulfillRandomWords(
                      txReceipt.events[1].args.RequestId,
                      raffle.address
                  )
              })
          })
      })
