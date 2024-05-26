import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import {
  APEERC20Template__factory,
  APEERC20Template,
  FakeOracleAggregator__factory,
  FakeOracleAggregator,
  BoundingCurveUpgradable__factory,
  BoundingCurveUpgradable,
} from "../typechain-types";
const wethJson = require("@uniswap/v2-periphery/build/WETH9.json");
import uniswapFactory from "@uniswap/v2-core/build/UniswapV2Factory.json";
import uniswapRouter from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import uniswapPair from "@uniswap/v2-core/build/UniswapV2Pair.json";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";

const creaditEthTOAdress = async (address: string) => {
  await ethers.provider.send("hardhat_setBalance", [
    address,
    "0x" + ethers.parseEther("1000").toString(16), // 100 ETH
  ]);
};

function getAmountsOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
) {
  const amountInWithFee = amountIn;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return numerator / denominator;
}
const INITIAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
const LAUNCH_MARKEY_CAP = 69_000n * 10n ** 18n;
const STOP_MAX_WALLET = 20_000n * 10n ** 18n;
const BUY_FEE_BPS = 1000n; // 10%
const SELL_FEE_BPS = 1000n; // 10%
const LISTING_FEE_BPS = 1000n; // 10%

const MIN_V_LP = 10n ** 18n;

describe("Bounding Curve", function () {
  let weth: Contract;
  let uniFactory: Contract;
  let uniRouter: Contract;
  let fakeAggregator: FakeOracleAggregator;
  let boundingCurve: BoundingCurveUpgradable;

  before(async function () {
    const [owner, feeCollector] = await ethers.getSigners();

    const UniswapV2Factory = await ethers.getContractFactory(
      uniswapFactory.abi,
      uniswapFactory.bytecode
    );
    uniFactory = (await UniswapV2Factory.deploy(owner.address)) as Contract;
    await uniFactory.waitForDeployment();

    const WETH9 = (await ethers.getContractFactory(
      wethJson.abi,
      wethJson.bytecode
    )) as ContractFactory;

    weth = (await WETH9.deploy()) as Contract;
    await weth.waitForDeployment();

    const UniswapV2Router02 = await ethers.getContractFactory(
      uniswapRouter.abi,
      uniswapRouter.bytecode
    );

    uniRouter = (await UniswapV2Router02.deploy(
      await uniFactory.getAddress(),
      await weth.getAddress()
    )) as Contract;

    await uniRouter.waitForDeployment();

    // deploy fake agregator
    const FakeAggregatorFactory = new FakeOracleAggregator__factory(owner);

    fakeAggregator = await FakeAggregatorFactory.deploy();

    await fakeAggregator.waitForDeployment();

    // deploy bounding curve
    const BoundingFactory = new BoundingCurveUpgradable__factory(owner);
    /*
            AggregatorV3Interface dataFeed_,
        uint256 minVirtualLP_,
        IUniFactory uniFactory_,
        IUniswapV2Router02 uniRouter_
    */
    /*
    boundingCurve = await BoundingFactory.deploy(
      await fakeAggregator.getAddress(),
      MIN_V_LP,
      uniFactory,
      uniRouter
    );

    await boundingCurve.waitForDeployment();
    */
    // @ts-ignore
    boundingCurve = (await hre.upgrades.deployProxy(
      BoundingFactory,
      [
        owner.address,
        feeCollector.address,
        BUY_FEE_BPS,
        SELL_FEE_BPS,
        LISTING_FEE_BPS,
      ],
      {
        kind: "uups",
        constructorArgs: [
          await fakeAggregator.getAddress(),
          MIN_V_LP,
          await uniFactory.getAddress(),
          await uniRouter.getAddress(),
        ],
      }
    )) as BoundingCurveUpgradable;
  });

  it("should have the right details ", async () => {
    const [owner, feeCollector] = await ethers.getSigners();
    const minVLP = await boundingCurve.minVLP();
    expect(minVLP).to.equal(MIN_V_LP);

    const aggregator = await boundingCurve.dataFeed();
    expect(aggregator).to.equal(await fakeAggregator.getAddress());

    const factory = await boundingCurve.uniFactory();
    expect(factory).to.equal(await uniFactory.getAddress());

    const router = await boundingCurve.uniRouter();
    expect(router).to.equal(await uniRouter.getAddress());

    const wethAddress = await boundingCurve.WETH();
    expect(wethAddress).to.equal(await weth.getAddress());

    const oracleDecimals = await boundingCurve.oracleDecimals();
    expect(oracleDecimals).to.equal(7);

    /*
        uint256 buyFeeBps;
    uint256 sellFeeBps;
    uint256 listingFeeBps;
    address feeTo;
    */
    const buyFeeBps = await boundingCurve.buyFeeBps();
    expect(buyFeeBps).to.equal(BUY_FEE_BPS);

    const sellFeeBps = await boundingCurve.sellFeeBps();
    expect(sellFeeBps).to.equal(SELL_FEE_BPS);

    const listingFeeBps = await boundingCurve.listingFeeBps();
    expect(listingFeeBps).to.equal(LISTING_FEE_BPS);

    const feeTo = await boundingCurve.feeTo();
    expect(feeTo).to.equal(await feeCollector.getAddress());
  });

  it("should call setFeeTo", async () => {
    const [owner, feeCollector, newC] = await ethers.getSigners();

    // fails for non owner
    await expect(
      boundingCurve.connect(feeCollector).setFeeTo(feeCollector.address)
    ).to.be.revertedWithCustomError(
      boundingCurve,
      "OwnableUnauthorizedAccount"
    );

    // success for owner
    await boundingCurve.setFeeTo(newC.address);
    const feeTo = await boundingCurve.feeTo();
    expect(feeTo).to.equal(newC.address);

    // revert it back
    await boundingCurve.setFeeTo(feeCollector.address);

    // fails to set the same amount
    await expect(
      boundingCurve.setFeeTo(feeCollector.address)
    ).to.be.revertedWith("Redundant setFeeTo call");

    // fails to set address zero
    await expect(boundingCurve.setFeeTo(ethers.ZeroAddress)).to.be.revertedWith(
      "FeeTo cannot be 0"
    );
  });

  it("should call setBuyFeeBps", async () => {
    const [owner, feeCollector] = await ethers.getSigners();

    // fails for non owner
    await expect(
      boundingCurve.connect(feeCollector).setBuyFeeBps(123)
    ).to.be.revertedWithCustomError(
      boundingCurve,
      "OwnableUnauthorizedAccount"
    );

    // fals for an amount over 1000
    await expect(boundingCurve.setBuyFeeBps(1001)).to.be.revertedWith(
      "Buy fee too high"
    );

    // success for owner
    await boundingCurve.setBuyFeeBps(123);
    const buyFeeBps = await boundingCurve.buyFeeBps();
    expect(buyFeeBps).to.equal(123);

    // revert it back
    await boundingCurve.setBuyFeeBps(BUY_FEE_BPS);

    // fails to set the same amount
    await expect(boundingCurve.setBuyFeeBps(BUY_FEE_BPS)).to.be.revertedWith(
      "Redundant setBuyFeeBps call"
    );
  });

  it("should call setSellFeeBps", async () => {
    const [owner, feeCollector] = await ethers.getSigners();

    // fails for non owner
    await expect(
      boundingCurve.connect(feeCollector).setSellFeeBps(123)
    ).to.be.revertedWithCustomError(
      boundingCurve,
      "OwnableUnauthorizedAccount"
    );

    // fals for an amount over 1000
    await expect(boundingCurve.setSellFeeBps(1001)).to.be.revertedWith(
      "Sell fee too high"
    );

    // success for owner
    await boundingCurve.setSellFeeBps(123);
    const sellFeeBps = await boundingCurve.sellFeeBps();
    expect(sellFeeBps).to.equal(123);

    // revert it back
    await boundingCurve.setSellFeeBps(SELL_FEE_BPS);

    // fails to set the same amount
    await expect(boundingCurve.setSellFeeBps(SELL_FEE_BPS)).to.be.revertedWith(
      "Redundant setSellFeeBps call"
    );
  });

  it("should call setListingFeeBps", async () => {
    const [owner, feeCollector] = await ethers.getSigners();

    // fails for non owner
    await expect(
      boundingCurve.connect(feeCollector).setListingFeeBps(123)
    ).to.be.revertedWithCustomError(
      boundingCurve,
      "OwnableUnauthorizedAccount"
    );

    // fals for an amount over 1000
    await expect(boundingCurve.setListingFeeBps(1001)).to.be.revertedWith(
      "Listing fee too high"
    );

    // success for owner
    await boundingCurve.setListingFeeBps(123);
    const listingFeeBps = await boundingCurve.listingFeeBps();
    expect(listingFeeBps).to.equal(123);

    // revert it back
    await boundingCurve.setListingFeeBps(LISTING_FEE_BPS);

    // fails to set the same amount
    await expect(
      boundingCurve.setListingFeeBps(LISTING_FEE_BPS)
    ).to.be.revertedWith("Redundant setListingFeeBps call");
  });

  const TOKEN1_NAME = "TOKEN1";
  const TOKEN1_SYMBOL = "SYMBOL";
  let token1: APEERC20Template;

  it("should deploy a new ERC22", async () => {
    const [owner, feeCollector, deployer1] = await ethers.getSigners();

    const tx = await boundingCurve
      .connect(deployer1)
      .createNewToken(TOKEN1_NAME, TOKEN1_SYMBOL, 0);
    const receipt = await tx.wait();

    /*
        event TokenCreated(
        address token,
        address owner,
        uint256 supply,
        string name,
        string symbol,
        uint256 maxWallet
    );
    */

    const logs = receipt?.logs;
    const event = logs?.find((log) => {
      return (
        log.topics[0] ===
        ethers.id("TokenCreated(address,address,uint256,string,string,uint256)")
      );
    });

    const decoded = boundingCurve.interface.decodeEventLog(
      "TokenCreated",
      // @ts-ignore
      event?.data,
      event?.topics
    );

    expect(decoded.owner).to.equal(deployer1.address);
    expect(decoded.supply).to.equal(INITIAL_SUPPLY);
    expect(decoded.name).to.equal(TOKEN1_NAME);
    expect(decoded.symbol).to.equal(TOKEN1_SYMBOL);
    expect(decoded.maxWallet).to.equal(0);

    const tokenAddress: string | undefined = decoded?.token;

    if (!tokenAddress) {
      throw new Error("Token address not found");
    }

    token1 = APEERC20Template__factory.connect(tokenAddress, owner);

    const name = await token1.name();
    expect(name).to.equal(TOKEN1_NAME);
    const symbol = await token1.symbol();
    expect(symbol).to.equal(TOKEN1_SYMBOL);

    const maxWallet = await token1.maxWallet();
    expect(maxWallet).to.equal(0);

    // expect the curve to have the totla supply
    const totalSupply = await token1.totalSupply();
    expect(totalSupply).to.equal(INITIAL_SUPPLY);

    const balanceOfCurve = await token1.balanceOf(boundingCurve.getAddress());
    expect(balanceOfCurve).to.equal(INITIAL_SUPPLY);

    const virtualLp = await boundingCurve.virtualLiquidity(tokenAddress);

    expect(virtualLp.reserve0).to.equal(INITIAL_SUPPLY);
    expect(virtualLp.reserve1).to.equal(0);
    expect(virtualLp.k).to.equal(INITIAL_SUPPLY * 10n ** 18n);
    expect(virtualLp.launched).equal(false);
  });

  const TOKEN2_NAME = "TOKEN2";
  const TOKEN2_SYMBOL = "SYMBOL2";
  const TOKEN2_MAX_WALLET = (INITIAL_SUPPLY * 51n) / 100n;
  let token2: APEERC20Template;

  it("should deploy second token with owner appeing", async () => {
    const [owner, feeCollector, deployer1, deployer2] =
      await ethers.getSigners();

    const ethbalanceOfFeeCollector = await ethers.provider.getBalance(
      feeCollector.address
    );

    const tx = await boundingCurve
      .connect(deployer2)
      .createNewToken(TOKEN2_NAME, TOKEN2_SYMBOL, TOKEN2_MAX_WALLET, {
        value: ethers.parseEther("1"),
      });

    const receipt = await tx.wait();

    const logs = receipt?.logs;
    const event = logs?.find((log) => {
      return (
        log.topics[0] ===
        ethers.id("TokenCreated(address,address,uint256,string,string,uint256)")
      );
    });
    const decoded = boundingCurve.interface.decodeEventLog(
      "TokenCreated",
      // @ts-ignore
      event?.data,
      event?.topics
    );

    expect(decoded.owner).to.equal(deployer2.address);
    expect(decoded.supply).to.equal(INITIAL_SUPPLY);
    expect(decoded.name).to.equal(TOKEN2_NAME);
    expect(decoded.symbol).to.equal(TOKEN2_SYMBOL);
    expect(decoded.maxWallet).to.equal(TOKEN2_MAX_WALLET);

    const tokenAddress: string | undefined = decoded?.token;

    if (!tokenAddress) {
      throw new Error("Token address not found");
    }

    token2 = APEERC20Template__factory.connect(tokenAddress, owner);

    const name = await token2.name();
    expect(name).to.equal(TOKEN2_NAME);
    const symbol = await token2.symbol();
    expect(symbol).to.equal(TOKEN2_SYMBOL);

    const maxWallet = await token2.maxWallet();
    expect(maxWallet).to.equal(TOKEN2_MAX_WALLET);

    // expect the curve to have the totla supply
    const totalSupply = await token2.totalSupply();
    expect(totalSupply).to.equal(INITIAL_SUPPLY);

    const expectedOut = getAmountsOut(
      (ethers.parseEther("1") * (10000n - LISTING_FEE_BPS)) / 10000n,
      MIN_V_LP,
      INITIAL_SUPPLY
    );

    const newReserves1 =
      MIN_V_LP + (ethers.parseEther("1") * (10000n - LISTING_FEE_BPS)) / 10000n;
    const newReserves0 = INITIAL_SUPPLY - expectedOut;

    const balanceOfCurve = await token2.balanceOf(boundingCurve.getAddress());
    expect(balanceOfCurve).to.equal(newReserves0);

    const virtualLp = await boundingCurve.virtualLiquidity(tokenAddress);

    expect(virtualLp.reserve0).to.equal(newReserves0);
    expect(virtualLp.reserve1).to.equal(newReserves1 - MIN_V_LP);
    expect(virtualLp.k).to.equal(newReserves0 * newReserves1);
    expect(virtualLp.launched).equal(false);

    // eth balance eof curve should be (newReserves1 - MIN_V_LP)
    const ethBalance = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(ethBalance).to.equal(newReserves1 - MIN_V_LP);

    const ethbalanceOfFeeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(ethbalanceOfFeeCollectorAfter).to.equal(
      ethbalanceOfFeeCollector + (ethers.parseEther("1") * BUY_FEE_BPS) / 10000n
    );
  });

  const TOKEN1_BUYERS_AMOUNTS = [
    ethers.parseEther("1"),
    ethers.parseEther("1.1"),
    ethers.parseEther("0.5"),
  ];

  const TOEKEN1_BUYERS_BOUGHT: bigint[] = [];

  it("should allow buyer1 to buy token1", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getTokenAmountOut(
      token1.getAddress(),
      (TOKEN1_BUYERS_AMOUNTS[0] * (10000n - BUY_FEE_BPS)) / 10000n
    );

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    // slipage working
    await expect(
      boundingCurve
        .connect(buyer1)
        .buyToken(token1.getAddress(), expectedOut + 1n, {
          value: TOKEN1_BUYERS_AMOUNTS[0],
        })
    ).to.be.revertedWith("Slippage");

    // fails to buy 0 value
    await expect(
      boundingCurve.connect(buyer1).buyToken(token1.getAddress(), 0, {
        value: 0,
      })
    ).to.be.revertedWith("ETH value must be greater than 0");

    await boundingCurve.connect(buyer1).buyToken(token1.getAddress(), 0, {
      value: TOKEN1_BUYERS_AMOUNTS[0],
    });

    const balanceOfBuyer1 = await token1.balanceOf(buyer1.address);
    expect(balanceOfBuyer1).to.equal(expectedOut);

    TOEKEN1_BUYERS_BOUGHT.push(balanceOfBuyer1);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(
      feeCollectorETHBalance + (TOKEN1_BUYERS_AMOUNTS[0] * 1000n) / 10000n
    );

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(
      curveEthBalanceBefore + (TOKEN1_BUYERS_AMOUNTS[0] * 9000n) / 10000n
    );
  });

  it("should allow buyer2 to buy token1", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getTokenAmountOut(
      token1.getAddress(),
      (TOKEN1_BUYERS_AMOUNTS[1] * (10000n - BUY_FEE_BPS)) / 10000n
    );

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    await boundingCurve.connect(buyer2).buyToken(token1.getAddress(), 0, {
      value: TOKEN1_BUYERS_AMOUNTS[1],
    });

    const balanceOfBuyer2 = await token1.balanceOf(buyer2.address);
    expect(balanceOfBuyer2).to.equal(expectedOut);

    TOEKEN1_BUYERS_BOUGHT.push(balanceOfBuyer2);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(
      feeCollectorETHBalance + (TOKEN1_BUYERS_AMOUNTS[1] * 1000n) / 10000n
    );

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(
      curveEthBalanceBefore + (TOKEN1_BUYERS_AMOUNTS[1] * 9000n) / 10000n
    );
  });

  it("should allow buyer3 to buy token1", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getTokenAmountOut(
      token1.getAddress(),
      (TOKEN1_BUYERS_AMOUNTS[2] * (10000n - BUY_FEE_BPS)) / 10000n
    );

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    await boundingCurve.connect(buyer3).buyToken(token1.getAddress(), 0, {
      value: TOKEN1_BUYERS_AMOUNTS[2],
    });

    const balanceOfBuyer3 = await token1.balanceOf(buyer3.address);
    expect(balanceOfBuyer3).to.equal(expectedOut);
    TOEKEN1_BUYERS_BOUGHT.push(balanceOfBuyer3);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(
      feeCollectorETHBalance + (TOKEN1_BUYERS_AMOUNTS[2] * 1000n) / 10000n
    );

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(
      curveEthBalanceBefore + (TOKEN1_BUYERS_AMOUNTS[2] * 9000n) / 10000n
    );
  });

  it("should allow buyer1 to sell token1", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getEthAmountOut(
      token1.getAddress(),
      TOEKEN1_BUYERS_BOUGHT[0]
    );

    const expectedFee = (expectedOut * SELL_FEE_BPS) / 10000n;

    const netAmountOut = expectedOut - expectedFee;

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    await token1
      .connect(buyer1)
      .approve(boundingCurve.getAddress(), TOEKEN1_BUYERS_BOUGHT[0]);

    await boundingCurve
      .connect(buyer1)
      .sellToken(token1.getAddress(), TOEKEN1_BUYERS_BOUGHT[0], netAmountOut);

    const balanceOfBuyer1 = await token1.balanceOf(buyer1.address);

    expect(balanceOfBuyer1).to.equal(0);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(feeCollectorETHBalance + expectedFee);

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(curveEthBalanceBefore - expectedOut);
  });

  it("should allow buyer2 to sell token1", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getEthAmountOut(
      token1.getAddress(),
      TOEKEN1_BUYERS_BOUGHT[1]
    );

    const expectedFee = (expectedOut * SELL_FEE_BPS) / 10000n;

    const netAmountOut = expectedOut - expectedFee;

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    await token1
      .connect(buyer2)
      .approve(boundingCurve.getAddress(), TOEKEN1_BUYERS_BOUGHT[1]);

    await boundingCurve
      .connect(buyer2)
      .sellToken(token1.getAddress(), TOEKEN1_BUYERS_BOUGHT[1], netAmountOut);

    const balanceOfBuyer2 = await token1.balanceOf(buyer2.address);

    expect(balanceOfBuyer2).to.equal(0);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(feeCollectorETHBalance + expectedFee);

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(curveEthBalanceBefore - expectedOut);
  });

  it("should allow buyer3 to sell token1", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getEthAmountOut(
      token1.getAddress(),
      TOEKEN1_BUYERS_BOUGHT[2]
    );

    const expectedFee = (expectedOut * SELL_FEE_BPS) / 10000n;

    const netAmountOut = expectedOut - expectedFee;

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    await token1
      .connect(buyer3)
      .approve(boundingCurve.getAddress(), TOEKEN1_BUYERS_BOUGHT[2]);

    await boundingCurve
      .connect(buyer3)
      .sellToken(token1.getAddress(), TOEKEN1_BUYERS_BOUGHT[2], netAmountOut);

    const balanceOfBuyer3 = await token1.balanceOf(buyer3.address);

    expect(balanceOfBuyer3).to.equal(0);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(feeCollectorETHBalance + expectedFee);

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(curveEthBalanceBefore - expectedOut);
  });

  it("should fail to sell or buy 0 amounts", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    await expect(
      boundingCurve.connect(buyer3).sellToken(token1.getAddress(), 0, 0)
    ).to.be.revertedWith("Amount must be greater than 0");
  });

  const TOKEN2_BUYERS_AMOUNTS = [
    ethers.parseEther("1"),
    ethers.parseEther("1"),
    ethers.parseEther("0.1"),
  ];

  const TOEKEN2_BUY_AMOUNTS: bigint[] = [];

  it("should allow buyer1 to buy token2", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getTokenAmountOut(
      token2.getAddress(),
      (TOKEN2_BUYERS_AMOUNTS[0] * (10000n - BUY_FEE_BPS)) / 10000n
    );

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    await boundingCurve.connect(buyer1).buyToken(token2.getAddress(), 0, {
      value: TOKEN2_BUYERS_AMOUNTS[0],
    });

    const balanceOfBuyer1 = await token2.balanceOf(buyer1.address);
    expect(balanceOfBuyer1).to.equal(expectedOut);

    TOEKEN2_BUY_AMOUNTS.push(balanceOfBuyer1);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(
      feeCollectorETHBalance + (TOKEN2_BUYERS_AMOUNTS[0] * 1000n) / 10000n
    );

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(
      curveEthBalanceBefore + (TOKEN2_BUYERS_AMOUNTS[0] * 9000n) / 10000n
    );
  });

  it("should allow buyer2 to buy token2", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getTokenAmountOut(
      token2.getAddress(),
      (TOKEN2_BUYERS_AMOUNTS[1] * (10000n - BUY_FEE_BPS)) / 10000n
    );

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    await boundingCurve
      .connect(buyer2)
      .buyToken(token2.getAddress(), 0, { value: TOKEN2_BUYERS_AMOUNTS[1] });

    const balanceOfBuyer2 = await token2.balanceOf(buyer2.address);
    expect(balanceOfBuyer2).to.equal(expectedOut);

    TOEKEN2_BUY_AMOUNTS.push(balanceOfBuyer2);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(
      feeCollectorETHBalance + (TOKEN2_BUYERS_AMOUNTS[1] * 1000n) / 10000n
    );

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(
      curveEthBalanceBefore + (TOKEN2_BUYERS_AMOUNTS[1] * 9000n) / 10000n
    );
  });

  it("should allow buyer3 to buy token2", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const expectedOut = await boundingCurve.getTokenAmountOut(
      token2.getAddress(),
      (TOKEN2_BUYERS_AMOUNTS[2] * (10000n - BUY_FEE_BPS)) / 10000n
    );

    let feeCollectorETHBalance = await ethers.provider.getBalance(
      feeCollector.address
    );

    const curveEthBalanceBefore = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    await boundingCurve
      .connect(buyer3)
      .buyToken(token2.getAddress(), 0, { value: TOKEN2_BUYERS_AMOUNTS[2] });

    const balanceOfBuyer3 = await token2.balanceOf(buyer3.address);
    expect(balanceOfBuyer3).to.equal(expectedOut);

    TOEKEN2_BUY_AMOUNTS.push(balanceOfBuyer3);

    let feeCollectorAfter = await ethers.provider.getBalance(
      feeCollector.address
    );

    expect(feeCollectorAfter).to.equal(
      feeCollectorETHBalance + (TOKEN2_BUYERS_AMOUNTS[2] * 1000n) / 10000n
    );

    const curveEthBalanceAfter = await ethers.provider.getBalance(
      boundingCurve.getAddress()
    );

    expect(curveEthBalanceAfter).to.equal(
      curveEthBalanceBefore + (TOKEN2_BUYERS_AMOUNTS[2] * 9000n) / 10000n
    );
  });

  it("should fail to create LP for token2", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const pair = await token2.pairAddress();

    // expect transfer to pair to fail
    await expect(
      token2.connect(buyer1).transfer(pair, TOEKEN2_BUY_AMOUNTS[0])
    ).to.be.revertedWith(
      "APEERC20Template: Can't send tokens to pair before launch"
    );
  });

  let token3: APEERC20Template;

  it("it should deploy token 3", async () => {
    const [owner, feeCollector, deployer1, deployer2, buyer1, buyer2, buyer3] =
      await ethers.getSigners();

    const tx = await boundingCurve.createNewToken("TOKEN", "TKN", 0, {
      value: ethers.parseEther("1"),
    });

    const receipt = await tx.wait();

    const logs = receipt?.logs;

    const event = logs?.find((log) => {
      return (
        log.topics[0] ===
        ethers.id("TokenCreated(address,address,uint256,string,string,uint256)")
      );
    });

    const decoded = boundingCurve.interface.decodeEventLog(
      "TokenCreated",
      // @ts-ignore
      event?.data,
      event?.topics
    );

    expect(decoded.owner).to.equal(owner.address);

    const tokenAddress: string | undefined = decoded?.token;

    if (!tokenAddress) {
      throw new Error("Token address not found");
    }

    token3 = APEERC20Template__factory.connect(tokenAddress, owner);

    // buyer1 buys 2 eth
    await boundingCurve.connect(buyer1).buyToken(token3.getAddress(), 0, {
      value: ethers.parseEther("1"),
    });

    // buyer2 buys 3 eth
    await boundingCurve.connect(buyer2).buyToken(token3.getAddress(), 0, {
      value: ethers.parseEther("2"),
    });

    // buyer3 buys 4 eth
    await boundingCurve.connect(buyer3).buyToken(token3.getAddress(), 0, {
      value: ethers.parseEther("2"),
    });

    const pairContract = APEERC20Template__factory.connect(
      await token3.pairAddress(),
      owner
    );

    const totalSupply = await token3.totalSupply();

    // expect totalSupply to be 10
    expect(totalSupply).to.greaterThan(0);
  });
});
