import { expect } from "chai";
import hre from "hardhat";

describe("Actuator", () => {
  const PRICE = hre.ethers.parseEther("1");

  async function deployActuator() {
    const [payer] = await hre.ethers.getSigners();
    const factory = await hre.ethers.getContractFactory("Actuator");
    const actuator = await factory.deploy();
    await actuator.waitForDeployment();
    return { actuator, payer };
  }

  it("starts with triggerNonce zero", async () => {
    const { actuator } = await deployActuator();
    expect(await actuator.triggerNonce()).to.equal(0n);
  });

  it("accepts exactly 1 PAS, increments once, and emits Activated", async () => {
    const { actuator, payer } = await deployActuator();
    const transaction = await actuator.trigger({ value: PRICE });
    const receipt = await transaction.wait();
    const block = await hre.ethers.provider.getBlock(receipt!.blockNumber);

    await expect(transaction)
      .to.emit(actuator, "Activated")
      .withArgs(payer.address, 1n, PRICE, BigInt(block!.timestamp));
    expect(await actuator.triggerNonce()).to.equal(1n);
  });

  it("rejects a payment below 1 PAS", async () => {
    const { actuator } = await deployActuator();
    await expect(actuator.trigger({ value: PRICE - 1n })).to.be.revertedWith(
      "exactly 1 PAS required",
    );
    expect(await actuator.triggerNonce()).to.equal(0n);
  });

  it("rejects a payment above 1 PAS", async () => {
    const { actuator } = await deployActuator();
    await expect(actuator.trigger({ value: PRICE + 1n })).to.be.revertedWith(
      "exactly 1 PAS required",
    );
    expect(await actuator.triggerNonce()).to.equal(0n);
  });

  it("creates sequential nonces for sequential valid triggers", async () => {
    const { actuator } = await deployActuator();
    await (await actuator.trigger({ value: PRICE })).wait();
    await (await actuator.trigger({ value: PRICE })).wait();
    await (await actuator.trigger({ value: PRICE })).wait();
    expect(await actuator.triggerNonce()).to.equal(3n);
  });
});
