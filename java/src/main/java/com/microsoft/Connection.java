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

import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

class ChannelOwner {
}

public class Connection {
  private final Transport transport;
  private final Map<String, ChannelOwner> objects = new HashMap();


  public Connection(InputStream in, OutputStream out) {
    transport = new Transport(in, out, message -> {
      System.out.println("recv message = " + message);
    });
  }

  public Object waitForObjectWithKnownName(String guid) {
    while (this.objects.containsKey(guid)) {
      processOneMessage();
    }
    return this.objects.get(guid);
  }

  private void processOneMessage() {
  }
}
