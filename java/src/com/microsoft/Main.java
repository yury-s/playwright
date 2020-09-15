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

public class Main {

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

  public static void main(String[] args) throws IOException {
    String cmd = "node /home/yurys/playwright/java/driver/main.js";
    Process p = Runtime.getRuntime().exec(cmd);
    System.out.println("Is alive = " + p.isAlive());
    InputStream stdout = p.getInputStream();

    DataInputStream dataInput = new DataInputStream(new BufferedInputStream((stdout)));
    StringBuilder line = new StringBuilder();
    int count = 0;
    while (true) {
      int len = readIntLE(dataInput);
      System.out.println("len = " + len);
      byte[] raw = new byte[len];
      dataInput.readFully(raw, 0, len);
      String message = new String(raw, StandardCharsets.UTF_8);
      System.out.println("message = " + message);
//      int b = stdout.read();
//      if (b == -1)
//        break;
//      char c = (char) b;
//      line.append(c);
//      if (++count < 100) continue;
//      System.out.println(line);
//      line = new StringBuilder();
//      count = 0;
    }

//    try (BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(stdout))) {
//      String line;
//      while ((line = bufferedReader.readLine()) != null) {
//        System.out.println(line);
//      }
//    }
  }
}
