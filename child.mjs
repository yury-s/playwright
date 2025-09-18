function setupExitWatchdog() {
  let isExiting = false;
  console.error('*** setupExitWatchdog', isExiting);
  const handleExit = async (reason) => {
    console.error('*** handleExit', isExiting, reason);
    if (isExiting)
      return;
    isExiting = true;
    // eslint-disable-next-line no-restricted-properties
    setTimeout(() => process.exit(0), 15000);
    await new Promise(resolve => setTimeout(resolve, 100));
    console.error('*** process.exit(0)');
    // eslint-disable-next-line no-restricted-properties
    process.exit(0);
  };

  process.stdin.on('close', () => handleExit('close'));
  process.stdin.on('end', () => handleExit('end'));
  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
}

setInterval(() => {
  console.error('*** interval');
}, 1000);

setupExitWatchdog();
