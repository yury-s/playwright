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

interface ElementHandle{
  ElementHandle querySelector(String selector); 
  List<ElementHandle> querySelectorAll(String selector); 
  Object evalOnSelector(String selector, String pageFunction, Object arg); 
  Object evalOnSelectorAll(String selector, String pageFunction, Object arg); 
  Object boundingBox(); 
  void check(Object options); 
  void click(Object options); 
  Frame contentFrame(); 
  void dblclick(Object options); 
  void dispatchEvent(String type, Object eventInit); 
  void fill(String value, Object options); 
  void focus(); 
  String getAttribute(String name); 
  void hover(Object options); 
  String innerHTML(); 
  String innerText(); 
  Frame ownerFrame(); 
  void press(String key, Object options); 
  byte[] screenshot(Object options); 
  void scrollIntoViewIfNeeded(Object options); 
  List<String> selectOption(String values, Object options); 
  void selectText(Object options); 
  void setInputFiles(String files, Object options); 
  String textContent(); 
  String toString(); 
  void type(String text, Object options); 
  void uncheck(Object options); 
  void waitForElementState(String state, Object options); 
  ElementHandle waitForSelector(String selector, Object options); 
  ElementHandle asElement(); 
  void dispose(); 
  Object evaluate(String pageFunction, Object arg); 
  JSHandle evaluateHandle(String pageFunction, Object arg); 
  Map<String, JSHandle> getProperties(); 
  JSHandle getProperty(String propertyName); 
  Object jsonValue(); 
}

