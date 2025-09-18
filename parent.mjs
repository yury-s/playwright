import { spawn } from 'child_process';

async function launch(options) {
  const cp = spawn('node', [
    'child.mjs',
    ...(options?.args || []),
  ], {
    stdio: 'pipe',
    env: {
      ...process.env,
      DEBUG: 'pw:mcp:test',
      DEBUG_COLORS: '0',
      DEBUG_HIDE_DATE: '1',
    },
  });
  let stderr = '';
  cp.stderr?.on('data', data => {
    stderr += data.toString();
  });

  return { stderr: () => stderr, kill: () => {
    // cp.stdin?.end();
    // cp.stdin?.destroy();
    cp.kill('SIGTERM');
  } };
}


async function main() {
  const { stderr, kill } = await launch({});

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('launch stderr\n', stderr());


  kill();

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('kill stderr\n', stderr());
}

// setTimeout(() => {
//   console.log('timeout stderr', stderr());
// }, 100000);

main();
