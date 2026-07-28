import { ecRecover } from './src/crypto/secp256k1';
const msgHash = new Uint8Array(32); msgHash.fill(1);
const result = ecRecover(msgHash, 0, BigInt(1), BigInt(1));
console.log('Result is:', result);
