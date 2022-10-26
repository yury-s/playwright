   // Defaults:
   //   stage: 0
   //   runAlways: false
   //   stopOnFailure: false
   // stage aka order, phase, ...
   // workers - later

- run test in several browsers one at a time (https://github.com/microsoft/playwright/issues/17422)


Remove:
- stopOnFailure (becomes default)
- canShard

Add:
- run: 'always'  (== noShard)

Rename:
- stage -> ?

_________________________________
- group into when:

when: {
   order: -10,
   runAlways: true,
}



_________________________________

- concern: rename 'run' to what?
- concern: run: always runs even after setup failures
-  



Use cases:

- global setup (login) with tracing, video, report etc. (10 bugs)
- global setup per project (5 bugs)
- order between files (a lot)
- single threaded


_________________________________

- fetch tests from DB
-- storage stage always applies to each project

_________________________________

- test.configure({ globalSetup: 10 });
- project config globalSetup: true  (no way to lazily select required setups)
- project dependencies
- projectSetup (no way to lazily select required setups)
  + globalSetup that may contain test() calls
  - both will require use({ storageState: undefined })

- test.globalSetup - no easy way to descover when filtering out just one file (load files after filtering by file:line)


__________________________________
- no need for order between projects, only order between files
- 











