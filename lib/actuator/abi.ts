import type { AbiEntry } from "@parity/product-sdk-contracts";

export const ACTUATOR_ABI = [
  {
    type: "function",
    name: "triggerNonce",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "PRICE",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ACTIVATION_SECONDS",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "trigger",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
] satisfies AbiEntry[];
