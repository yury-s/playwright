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



- fetch tests from DB

-- storage stage always applies to each project

















