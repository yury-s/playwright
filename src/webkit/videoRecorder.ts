/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
import { launchProcess } from '../server/processLauncher';
import { RootLogger } from '../logger';
import { ChildProcess } from 'child_process';
import { assert } from '../helper';

export class VideoRecorder {
  private readonly _outputPath: string;
  private _process: ChildProcess | null = null;
  private _gracefullyClose: (() => Promise<void>) | null = null;
  private _lastWritePromise: Promise<void>;

  constructor(outputPath: string) {
    if (!outputPath.endsWith('.mp4'))
      outputPath += '.mp4';
    this._outputPath = outputPath;
    this._lastWritePromise = Promise.resolve();
  }

  async launch(logger: RootLogger) {
    assert(!this._isRunning());
    // const args = '-r 24 -i frames/frame_%03d.jpg -y -an -r 24 v.mp4'.split(' ');
    const args = '-f image2pipe -c:v mjpeg -i - -y -an -r 25'.split(' ');
    args.push(this._outputPath);
    const { launchedProcess, gracefullyClose } = await launchProcess({
      executablePath: ffmpegPath,
      args,
      pipeStdin: true,
      logger,
      attemptToGracefullyClose: async () => {
        console.log('Closing stdin...');
        launchedProcess.stdin.end();
      },
      onkill: (exitCode, signal) => {
        console.log(`ffmpeg onkill exitCode=${exitCode} signal=${signal}`);
      },
    });
    launchedProcess.stdin.on('finish', () => {
      console.log('ffmpeg finished input.');
    });
    launchedProcess.stdin.on('error', () => {
      console.log('ffmpeg error.');
    });
    console.log('LAUNCHED');
    this._process = launchedProcess;
    this._gracefullyClose = gracefullyClose;
  }

  async writeFrame(frame: Buffer) {
    assert(this._process);
    if (!this._isRunning())
      return;
    const previousWrites = this._lastWritePromise;
    let finishedWriting: () => void;
    this._lastWritePromise = new Promise(fulfill => finishedWriting = fulfill);
    const writePromise = this._lastWritePromise;
    await previousWrites;
    const start = Date.now();
    this._process.stdin.write(frame, async (error: Error | null | undefined) => {
      if (error)
        console.log(`ffmpeg failed to write: ${error}`);
      else
        console.log(`ffmpeg written frame: ${Date.now() - start}ms`);
      finishedWriting();
    });
    return writePromise;
  }

  async stop() {
    if (!this._gracefullyClose)
      return;
    const close = this._gracefullyClose;
    this._gracefullyClose = null;
    await this._lastWritePromise;
    await close();
  }

  private _isRunning(): boolean {
    return !!this._gracefullyClose;
  }
}