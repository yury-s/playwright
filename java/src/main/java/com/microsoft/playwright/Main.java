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

import java.io.*;

public class Main {

  public static void main(String[] args) throws IOException {
    Playwright playwright = Playwright.create();
    System.out.println("chromium = " + playwright.chromium);
    System.out.println("firefox = " + playwright.firefox);
    System.out.println("webkit = " + playwright.webkit);
    BrowserTypeLaunchOptions options = new BrowserTypeLaunchOptions();
    options.headless = false;
    Browser browser = playwright.chromium.launch(options);
    System.out.println("browser = " + browser);

    BrowserNewContextOptions contextOptions = new BrowserNewContextOptions();
    contextOptions.viewport = new BrowserNewContextOptions.Viewport();
    contextOptions.viewport.width = 800;
    contextOptions.viewport.height = 600;
    BrowserContext context = browser.newContext(contextOptions);
    System.out.println("context = " + context);
    Page page = context.newPage();
    System.out.println("page = " + page);
//    page.navigate("https://news.google.com");
    page.navigate("https://webkit.org");
  }
}
