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

import com.google.gson.JsonObject;

import java.io.IOException;

public class Playwright extends ChannelOwner {
  static Playwright create() throws IOException {
    String cmd = "node /home/yurys/playwright/java/driver/main.js";
    Process p = Runtime.getRuntime().exec(cmd);
    System.out.println("Is alive = " + p.isAlive());
    Connection connection = new Connection(p.getInputStream(), p.getOutputStream());
    Playwright playwright = (Playwright)connection.waitForObjectWithKnownName("Playwright");
    playwright.chromium.launch();
    return playwright;
  }

  public final BrowserType chromium;
  public final BrowserType firefox;
  public final BrowserType webkit;

  public Playwright(ChannelOwner parent, String type, String guid, JsonObject initializer) {
    super(parent, type, guid, initializer);
    chromium = parent.connection.getExistingObject(initializer.getAsJsonObject("chromium").get("guid").getAsString());
    firefox = parent.connection.getExistingObject(initializer.getAsJsonObject("firefox").get("guid").getAsString());
    webkit = parent.connection.getExistingObject(initializer.getAsJsonObject("webkit").get("guid").getAsString());
  }
}
