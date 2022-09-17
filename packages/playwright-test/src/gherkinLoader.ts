/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AstBuilder, GherkinClassicTokenMatcher, Parser, compile } from '@cucumber/gherkin';
import type { Scenario, Step } from '@cucumber/messages';
import { IdGenerator } from '@cucumber/messages';
import * as fs from 'fs';
import { Suite, TestCase } from './test';
import { test } from './index';
import { TestTypeImpl } from './testType';
import { fixtureParameterNames, setFixtureParameterNames } from './fixtures';
import { debugTest } from './util';


export async function loadGherkinFeatureFile(parent: Suite, file: string, environment: 'runner' | 'worker') {
  const gherkinDocument = await loadGherkinDocument(file);
  if (!gherkinDocument.feature)
    return;

  const suite = new Suite(gherkinDocument.feature.name, 'describe');
  suite._requireFile = parent._requireFile;
  suite.location = { file, column: 0, ...gherkinDocument.feature.location };
  parent._addSuite(suite);

  // TODO: figure out how to get appropriate test type for the feature!
  const testType = TestTypeImpl._fromTest(test);


  const backgroundSteps: Step[] = [];
  for (const child of gherkinDocument.feature.children) {
    if (child.background)
      backgroundSteps.push(...child.background.steps);
  }

  const addTestCaseForScenario = (scenario: Scenario) => {
    const parameterNames = new Set<string>();

    const steps = [...backgroundSteps, ...scenario.steps];

    // TODO: Cucumber will replace these parameters with values from the table before it tries to match the step against a step definition.
    // if (scenario.examples.length) {
    //   // scenario.
    //   for (const example of scenario.examples) {
    //     const names =  example.tableHeader?.cells.map(c => c.value);
    //     for (const row of example.tableBody) {
    //       // row.cells.map()
    //     }
    //   }
    // } else {
    //   steps.push(...scenario.steps);
    // }

    // Derive all parameter names from step definitions.
    for (const step of steps) {
      // TODO: use keywordType instead to support localization
      const definitions = Suite._globalBddSteps.filter(definition => {
        // TODO: match And, But etc.
        if (definition.type !== step.keyword.trim())
          return;
        const mathes = definition.expression.match(step.text);
        // console.log(`  matches=${mathes} source=${definition.expression.source}`);
        return !!mathes;
      });
      if (definitions.length === 0)
        throw new Error(`No matching definition for step(${environment}): '${step.text}'\n  mentioned at ${file} ${JSON.stringify(step.location)}`);
      if (definitions.length > 1)
        throw new Error(`Multiple definitions for step(${environment}): '${step.text}'\n  mentioned at ${file} ${JSON.stringify(step.location)}`);

      const names = fixtureParameterNames(definitions[0].fn, definitions[0].location);
      names.forEach(n => parameterNames.add(n));
    }

    const testFn = async (fixtures: any) => {
      debugTest(`  bdd running steps for scenario: ${scenario.name}`);

      const runOneExample = async (exampleArgs: Map<string, any>) => {
        for (const step of steps) {
          // TODO: use keywordType instead to support localization
          const definitions = Suite._globalBddSteps.filter(definition => {
            if (definition.type !== step.keyword.trim())
              return;
            const mathes = definition.expression.match(step.text);
            return !!mathes;
          });
          if (definitions.length === 0)
            throw new Error(`No matching definition for step(${environment}): '${step.text}'\n  mentioned at ${file} ${JSON.stringify(step.location)}`);
          if (definitions.length > 1)
            throw new Error(`Multiple definitions for step(${environment}): '${step.text}'\n  mentioned at ${file} ${JSON.stringify(step.location)}`);
          const definition = definitions[0];
          const stepArguments = definition.expression.match(step.text)!.map(arg => {
            const value = arg.getValue({});
            debugTest(`  value: ${value}`);
            if (typeof value === 'string') {
              let key = value.trim();
              key = key.substring(1, key.length - 1);
              debugTest(`  key: ${key}`);
              if (exampleArgs.has(key))
                return exampleArgs.get(key);
            }
            return value;
          });
          const fn = definition.fn;// Extract a variable to get a better stack trace ("myTest" vs "TestCase.myTest [as fn]").
          debugTest(`  bdd step started: ${step.text}`);
          await fn(fixtures, ...stepArguments);
          debugTest(`  bdd step finished: ${step.text}`);
        }
      };
      if (scenario.examples.length) {
        for (const example of scenario.examples) {
          const names =  example.tableHeader?.cells.map(c => c.value);
          for (const row of example.tableBody) {
            const exampleArgs = new Map();
            debugTest(`  bdd running next example with: ${row.cells.map(c => c.value).join(' ')}`);
            for (let i = 0; i < (names?.length || 0); i++)
              exampleArgs.set(names?.[i], row.cells[i].value);
            await runOneExample(exampleArgs);
          }
        }
      } else {
        await runOneExample(new Map());
      }
    };
    setFixtureParameterNames(testFn, Array.from(parameterNames));

    const testCase = new TestCase(scenario.name, testFn, testType, { file, column: 0, ...scenario.location });
    testCase._requireFile = suite._requireFile;
    suite._addTest(testCase);
  };

  for (const child of gherkinDocument.feature.children) {
    if (child.scenario) {
      addTestCaseForScenario(child.scenario);
    } else if (child.rule) {
      for (const ruleItem of child.rule.children) {
        if (ruleItem.scenario)
          addTestCaseForScenario(ruleItem.scenario);
      }
    }
  }
}


export async function loadGherkinDocument(file: string) {
  const uuidFn = IdGenerator.uuid();
  const builder = new AstBuilder(uuidFn);
  const matcher = new GherkinClassicTokenMatcher(); // or GherkinInMarkdownTokenMatcher()

  const parser = new Parser(builder, matcher);
  const content = (await fs.promises.readFile(file)).toString('utf-8');
  const gherkinDocument = parser.parse(content);
  // console.log('*** gherkinDocument = ' + JSON.stringify(gherkinDocument, null, 2));
  return gherkinDocument;
  //   const pickles = await compile(gherkinDocument, 'file:///home/yurys/sandbox/pw-bdd/tests/features/playwright.feature', uuidFn);
  //   console.log('\n\n\n');

}