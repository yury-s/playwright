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

package com.microsoft.playwright;

import java.io.DataInputStream;
import java.io.EOFException;
import java.io.IOException;

public class Playwright {
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

  Playwright() throws IOException {
    String cmd = "node /home/yurys/playwright/java/driver/main.js";
    Process p = Runtime.getRuntime().exec(cmd);
    System.out.println("Is alive = " + p.isAlive());
    Connection connection = new Connection(p.getInputStream(), p.getOutputStream());
    connection.waitForObjectWithKnownName("Playwright");
  }
}
