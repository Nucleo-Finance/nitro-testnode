import { ethers } from "ethers";
import * as consts from "./consts";
import * as fs from "fs";
import * as crypto from "crypto";
import { runStress } from "./stress";
const path = require("path");

const specialAccounts = 6;

async function writeAccounts() {
	for (let i = 0; i < specialAccounts; i++) {
		const wallet = specialAccount(i);
		let walletJSON = await wallet.encrypt(consts.l1passphrase);
		fs.writeFileSync(
			path.join(consts.l1keystore, wallet.address + ".key"),
			walletJSON,
		);
	}
}

function specialAccount(index: number): ethers.Wallet {
	return ethers.Wallet.fromMnemonic(
		consts.l1mnemonic,
		"m/44'/60'/0'/0/" + index,
	);
}

function ownerAccount(): ethers.Wallet {
	const ownerPrivateKey =
		"59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

	return new ethers.Wallet(ownerPrivateKey);
}

export function namedAccount(
	name: string,
	threadId?: number | undefined,
): ethers.Wallet {
	if (name == "funnel") {
		return specialAccount(0);
	}
	if (name == "sequencer") {
		return specialAccount(1);
	}
	if (name == "validator") {
		return specialAccount(2);
	}
	if (name == "l3owner") {
		return specialAccount(3);
	}
	if (name == "l3sequencer") {
		return specialAccount(4);
	}
	if (name == "l2owner") {
		return specialAccount(5);
	}
	if (name == "owner") {
		return ownerAccount();
	}
	if (name.startsWith("user_")) {
		return new ethers.Wallet(
			ethers.utils.sha256(ethers.utils.toUtf8Bytes(name)),
		);
	}
	if (name.startsWith("threaduser_")) {
		if (threadId == undefined) {
			throw Error("threaduser_ account used but not supported here");
		}
		return new ethers.Wallet(
			ethers.utils.sha256(
				ethers.utils.toUtf8Bytes(
					name.substring(6) + "_thread_" + threadId.toString(),
				),
			),
		);
	}
	if (name.startsWith("key_")) {
		return new ethers.Wallet(ethers.utils.hexlify(name.substring(4)));
	}
	throw Error("bad account name: [" + name + "] see general help");
}

export function namedAddress(
	name: string,
	threadId?: number | undefined,
): string {
	if (name.startsWith("address_")) {
		return name.substring(8);
	}
	if (name == "random") {
		return "0x" + crypto.randomBytes(20).toString("hex");
	}
	return namedAccount(name, threadId).address;
}

export const namedAccountHelpString =
	"Valid account names:\n" +
	"  funnel | sequencer | validator | l2owner - known keys used by l2\n" +
	"  l3owner | l3sequencer                    - known keys used by l3\n" +
	"  user_[Alphanumeric]                      - key will be generated from username\n" +
	"  threaduser_[Alphanumeric]                - same as user_[Alphanumeric]_thread_[thread-id]\n" +
	"  key_0x[full private key]                 - user with specified private key\n" +
	"\n" +
	"Valid addresses: any account name, or\n" +
	"  address_0x[full eth address]\n" +
	"  random";

async function handlePrintAddress(argv: any, threadId: number) {
	console.log(namedAddress(argv.account, threadId));
}

async function handlePrintPrivateKey(argv: any, threadId: number) {
	console.log(namedAccount(argv.account, threadId).privateKey);
}

export const printAddressCommand = {
	command: "print-address",
	describe: "prints the requested address",
	builder: {
		account: {
			string: true,
			describe: "address (see general help)",
			default: "funnel",
		},
	},
	handler: async (argv: any) => {
		await runStress(argv, handlePrintAddress);
	},
};

export const printPrivateKeyCommand = {
	command: "print-private-key",
	describe: "prints the requested private key",
	builder: {
		account: {
			string: true,
			describe: "account (see general help)",
			default: "funnel",
		},
	},
	handler: async (argv: any) => {
		await runStress(argv, handlePrintPrivateKey);
	},
};

export const writeAccountsCommand = {
	command: "write-accounts",
	describe: "writes wallet files",
	handler: async (argv: any) => {
		await writeAccounts();
	},
};
