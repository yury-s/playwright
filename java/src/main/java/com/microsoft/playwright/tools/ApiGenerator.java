/**
 * Copyright (c) Microsoft Corporation.
 * <p>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.apache.org/licenses/LICENSE-2.0
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.microsoft.playwright.tools;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.*;
import java.util.*;
import java.util.function.BiConsumer;

public class ApiGenerator {
  private List<String> output;

  private static Map<String, String> tsToJavaMethodName = Map.of(
    "continue", "continue_",
    "$eval", "evalOnSelector",
    "$$eval", "evalOnSelectorAll",
    "$", "querySelector",
    "$$", "querySelectorAll",
    "goto", "navigate"
  );

  private static String header = "/**\n" +
    " * Copyright (c) Microsoft Corporation.\n" +
    " * <p>\n" +
    " * Licensed under the Apache License, Version 2.0 (the \"License\");\n" +
    " * you may not use this file except in compliance with the License.\n" +
    " * You may obtain a copy of the License at\n" +
    " * <p>\n" +
    " * http://www.apache.org/licenses/LICENSE-2.0\n" +
    " * <p>\n" +
    " * Unless required by applicable law or agreed to in writing, software\n" +
    " * distributed under the License is distributed on an \"AS IS\" BASIS,\n" +
    " * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n" +
    " * See the License for the specific language governing permissions and\n" +
    " * limitations under the License.\n" +
    " */\n" +
    "\n" +
    "package com.microsoft.playwright.api;\n";

  ApiGenerator(Reader reader) throws IOException {
    JsonObject api = new Gson().fromJson(reader, JsonObject.class);
//    BiConsumer<Integer, String> b = (i, s) -> {
//      System.out.println(s + i);
//    };
//    b.accept(10, "s = ");
    File dir = new File("/home/yurys/playwright/java/src/main/java/com/microsoft/playwright/api");
    for (var entry: api.entrySet()) {
      String name = entry.getKey();
      output = new ArrayList<>();
      output.add(header);
      output.add("import java.util.*;");
      output.add("import java.util.function.BiConsumer;");
      output.add("");
      output.add("interface " + name + "{");
      generateInterface(entry.getValue().getAsJsonObject(), "  ");
      output.add("}");
      output.add("\n");

      String text = String.join("\n", output);
//      System.out.println(text);

      var writer = new FileWriter(new File(dir, name + ".java"));
      writer.write(text);
      writer.close();
    }
  }

  private void generateInterface(JsonObject docClass, String offset) {
    JsonObject members = docClass.get("members").getAsJsonObject();
    for (var m : members.entrySet())
      generateMember(m.getValue().getAsJsonObject(), offset);
  }

  private void generateMember(JsonObject docMember, String offset) {
    String kind = docMember.get("kind").getAsString();
    String name = docMember.get("name").getAsString();
    if ("method".equals(kind)) {
      String type = convertReturnType(docMember.get("type"));

      StringBuilder args = new StringBuilder();
      if (docMember.get("args") != null) {
        for (var arg : docMember.get("args").getAsJsonObject().entrySet()) {
          String argName = arg.getKey();
          String argType = arg.getValue().getAsJsonObject().get("type").getAsJsonObject().get("name").getAsString();
          argType = convertBuiltinType(argType);

          if (argType.equals("function(Route, Request)")) {
            argType = "BiConsumer<Route, Request>";
          } else if (argType.equals("EvaluationArgument")) {
              argType = "Object";
          } else if (argType.equals("number")) {
            argType = "int";
          } else if (argType.contains("|")) {
//            System.out.println(name + " (" + argType + " " + arg.getKey() + ")");
            argType = "String";
          } else if (argType.contains("function")) {
            // js functions are always passed as text in java.
            if (argName.startsWith("playwright") || argName.startsWith("page")) {
              argType = "String";
            } else {
              System.out.println(name + " (" + argType + " " + arg.getKey() + ")");
            }
          }

          if (args.length() > 0)
            args.append(", ");
          args.append(argType).append(" ").append(argName);
        }
      }

      if (tsToJavaMethodName.containsKey(name))
        name = tsToJavaMethodName.get(name);
      output.add(offset + type + " " + name + "(" + args + "); ");
    }
  }

  private static String convertReturnType(JsonElement jsonType) {
    String type = jsonType.isJsonNull() ? "void" : jsonType.getAsJsonObject().get("name").getAsString();
    if ("Promise".equals(type))
      type = "void";
    // Java API is sync just strip Promise<>
    if (type.startsWith("Promise<"))
      type = type.substring("Promise<".length(), type.length() - 1);
    return convertBuiltinType(type);
  }

  private static String convertBuiltinType(String type) {
    return type.replace("Array<", "List<")
      .replace("string", "String")
      .replace("number", "int")
      .replace("Serializable", "Object")
      .replace("Buffer", "byte[]")
      .replace("ChildProcess", "Object")
      .replace("Object<", "Map<")
      .replace("null|", "");
  }

  public static void main(String[] args) throws IOException {
    String file = "/home/yurys/playwright/packages/playwright-driver/api.json";
    new ApiGenerator(new FileReader(file));
  }

}
