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
package com.microsoft;

import java.io.*;
import java.nio.charset.StandardCharsets;

public class Transport {
  private final Listener listener;
  private final DataInputStream in;
  private final DataOutputStream out;

  private static int readIntLE(DataInputStream in) throws IOException {
    int ch1 = in.read();
    int ch2 = in.read();
    int ch3 = in.read();
    int ch4 = in.read();
    if ((ch1 | ch2 | ch3 | ch4) < 0) {
      throw new EOFException();
    } else {
      return (ch4 << 24) + (ch3 << 16) + (ch2 << 8) + (ch1 << 0);
    }
  }

  private static void writeIntLE(DataOutputStream out, int v) throws IOException {
    out.write(v >>> 0 & 255);
    out.write(v >>> 8 & 255);
    out.write(v >>> 16 & 255);
    out.write(v >>> 24 & 255);
  }

  interface Listener {
    void handle(String message);
  }

  Transport(InputStream input, OutputStream output, Listener listener) {
    this.listener = listener;
    in = new DataInputStream(new BufferedInputStream(input));
    // TODO: buffer?
    out = new DataOutputStream(output);
    while (true) {
      try {
        readMessage();
      } catch (IOException e) {
        e.printStackTrace();
        break;
      }
    }
  }

  void send(String message) {
    int len = message.length();
    try {
      writeIntLE(out, len);
      out.writeUTF(message);
    } catch (IOException e) {
      e.printStackTrace();
    }
  }

  private void readMessage() throws IOException {
    int len = readIntLE(in);
    System.out.println("len = " + len);
    byte[] raw = new byte[len];
    in.readFully(raw, 0, len);
    String message = new String(raw, StandardCharsets.UTF_8);
    System.out.println("message = " + message);
  }
}
