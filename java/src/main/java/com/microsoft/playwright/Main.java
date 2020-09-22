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

import com.google.gson.Gson;
import com.google.gson.JsonElement;

import java.io.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.function.Supplier;


public class Main {

  public static void main(String[] args) throws IOException, InterruptedException, ExecutionException {
    Playwright playwright = Playwright.create();
    BrowserTypeLaunchOptions options = new BrowserTypeLaunchOptions();
    options.headless = false;
//    options.slowMo = 1000;
    System.out.println("options = " + new Gson().toJson(options));
    Browser browser = playwright.chromium.launch(options);
    System.out.println("browser = " + browser);

    BrowserNewContextOptions contextOptions = new BrowserNewContextOptions();
    contextOptions.viewport = new BrowserNewContextOptions.Viewport();
    contextOptions.viewport.width = 800;
    contextOptions.viewport.height = 600;
    BrowserContext context = browser.newContext(contextOptions);
    Page page = context.newPage();
    page.navigate("http://example.com");
//    page.click("text=web browser engine");

    Supplier<Page> popupSupplier = page.waitForPopup();
    var pageSupplier = context.waitForPage();
    JsonElement r = page.evaluate("window.open('http://example.com'); 13");
    System.out.println("r = " + new Gson().toJson(r));
    Page popup = popupSupplier.get();
    System.out.println("popup = " + popup);
    Page page2 = pageSupplier.get();
    System.out.println("popup == page2 is " + (popup == page2));
    browser.close();

    // Disconnect and terminate the threads?
    // playwright.close();
    System.out.println("\nDONE.");
    System.exit(0);
  }
}
