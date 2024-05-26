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
import hre from "hardhat";

const BUY_FEE_BPS = 1000n; // 10%
const SELL_FEE_BPS = 1000n; // 10%
const LISTING_FEE_BPS = 1000n; // 10%
const MIN_V_LP = 10n ** 18n;

async function main() {
  const [owner] = await ethers.getSigners();

  const UniswapV2Factory = await ethers.getContractFactory(
    uniswapFactory.abi,
    uniswapFactory.bytecode
  );
  const uniFactory = (await UniswapV2Factory.deploy(owner.address)) as Contract;
  await uniFactory.waitForDeployment();

  console.log("UniswapV2Factory deployed to:", await uniFactory.getAddress());

  const WETH9 = (await ethers.getContractFactory(
    wethJson.abi,
    wethJson.bytecode
  )) as ContractFactory;

  const weth = (await WETH9.deploy()) as Contract;
  await weth.waitForDeployment();

  console.log("WETH deployed to:", await weth.getAddress());

  const UniswapV2Router02 = await ethers.getContractFactory(
    uniswapRouter.abi,
    uniswapRouter.bytecode
  );

  const uniRouter = (await UniswapV2Router02.deploy(
    await uniFactory.getAddress(),
    await weth.getAddress()
  )) as Contract;

  await uniRouter.waitForDeployment();

  console.log("UniswapV2Router02 deployed to:", await uniRouter.getAddress());

  // deploy fake agregator
  const FakeAggregatorFactory = new FakeOracleAggregator__factory(owner);

  const fakeAggregator = await FakeAggregatorFactory.deploy();

  await fakeAggregator.waitForDeployment();

  console.log("FakeAggregator deployed to:", await fakeAggregator.getAddress());

  // deploy bounding curve
  const BoundingFactory = new BoundingCurveUpgradable__factory(owner);

  // @ts-ignore
  const boundingCurve = (await hre.upgrades.deployProxy(
    BoundingFactory,
    [owner.address, owner.address, BUY_FEE_BPS, SELL_FEE_BPS, LISTING_FEE_BPS],
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

  await boundingCurve.waitForDeployment();

  console.log(
    "BoundingCurveUpgradable deployed to:",
    await boundingCurve.getAddress()
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
