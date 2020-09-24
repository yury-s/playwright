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

import java.util.*;
import java.util.function.BiConsumer;

interface Page{
  void close(Object options);
  ElementHandle querySelector(String selector);
  List<ElementHandle> querySelectorAll(String selector);
  Object evalOnSelector(String selector, String pageFunction, Object arg);
  Object evalOnSelectorAll(String selector, String pageFunction, Object arg);
  void addInitScript(String script, Object arg);
  ElementHandle addScriptTag(Object options);
  ElementHandle addStyleTag(Object options);
  void bringToFront();
  void check(String selector, Object options);
  void click(String selector, Object options);
  String content();
  BrowserContext context();
  void dblclick(String selector, Object options);
  void dispatchEvent(String selector, String type, Object eventInit, Object options);
  void emulateMedia(Object options);
  Object evaluate(String pageFunction, Object arg);
  JSHandle evaluateHandle(String pageFunction, Object arg);
  void exposeBinding(String name, String playwrightBinding);
  void exposeFunction(String name, String playwrightFunction);
  void fill(String selector, String value, Object options);
  void focus(String selector, Object options);
  Frame frame(String options);
  List<Frame> frames();
  String getAttribute(String selector, String name, Object options);
  Response goBack(Object options);
  Response goForward(Object options);
  Response navigate(String url, Object options);
  void hover(String selector, Object options);
  String innerHTML(String selector, Object options);
  String innerText(String selector, Object options);
  boolean isClosed();
  Frame mainFrame();
  Page opener();
  byte[] pdf(Object options);
  void press(String selector, String key, Object options);
  Response reload(Object options);
  void route(String url, BiConsumer<Route, Request> handler);
  byte[] screenshot(Object options);
  List<String> selectOption(String selector, String values, Object options);
  void setContent(String html, Object options);
  void setDefaultNavigationTimeout(int timeout);
  void setDefaultTimeout(int timeout);
  void setExtraHTTPHeaders(Map<String, String> headers);
  void setInputFiles(String selector, String files, Object options);
  void setViewportSize(Object viewportSize);
  String textContent(String selector, Object options);
  String title();
  void type(String selector, String text, Object options);
  void uncheck(String selector, Object options);
  void unroute(String url, BiConsumer<Route, Request> handler);
  String url();
  Object viewportSize();
  Object waitForEvent(String event, String optionsOrPredicate);
  JSHandle waitForFunction(String pageFunction, Object arg, Object options);
  void waitForLoadState(String state, Object options);
  Response waitForNavigation(Object options);
  Request waitForRequest(String urlOrPredicate, Object options);
  Response waitForResponse(String urlOrPredicate, Object options);
  ElementHandle waitForSelector(String selector, Object options);
  void waitForTimeout(int timeout);
  List<Worker> workers();
}

