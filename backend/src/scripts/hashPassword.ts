import readline from 'readline';
import { hashPassword } from '../security/passwordHash';

async function readPasswordFromInput(): Promise<string> {
  if (process.env.ENGITRACE_NEW_PASSWORD) {
    return process.env.ENGITRACE_NEW_PASSWORD;
  }

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
  }

  return await new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true
    });
    const mutableStdout: any = process.stderr;
    let muted = false;
    const origWrite = mutableStdout.write.bind(mutableStdout);
    mutableStdout.write = (chunk: any, ...rest: any[]) => {
      if (!muted) {
        return origWrite(chunk, ...rest);
      }
      return true;
    };

    process.stderr.write('Enter new EngiTrace operator password (min 8 chars): ');
    muted = true;
    rl.question('', (answer) => {
      muted = false;
      mutableStdout.write = origWrite;
      process.stderr.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const password = await readPasswordFromInput();
  if (!password || password.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  const hash = await hashPassword(password);
  console.log('\nGenerated scrypt password hash (copy into backend/.env):');
  console.log(`ENGITRACE_OPERATOR_PASSWORD_HASH="${hash}"\n`);
}

main().catch((err) => {
  console.error('Failed to generate password hash:', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});

