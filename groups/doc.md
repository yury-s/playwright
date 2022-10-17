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