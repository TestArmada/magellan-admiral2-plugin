# Admiral2 Reporter Plugin for Magellan

This is a plugin to allow `magellan` test runs to report to the Admiral2 dashboard system.

**PLEASE NOTE: v3.0.0 would only be compatible with [Magellan](https://github.com/TestArmada/magellan) v10.0.0 and higher**

## Configuration

|Environment Variable|Required?|Description|Example|
|---|---|---|---|
|ADMIRAL_URL|required|The URL of the Admiral2 server|i.e `http://host-where-admiral-lives:3000/`|
|ADMIRAL_UI_URL|required|The URL of the Admiral2 UI|i.e. `http://host-where-admiral-UI-lives.tld`|
|ADMIRAL_PROJECT|required|An identifier for a project|i.e. `main-app`, `blog`, `product-page`, etc|
|ADMIRAL_PHASE|required|A lifecycle phase or build type descriptor|i.e. `pr-verify`, `master-verify`, etc|
|ADMIRAL_CI_BUILD_URL|optional|An URL to a CI report for this run|`http://travis-ci.org/SomeOrg/someproject/builds/189605665`|
|ADMIRAL_RUN_DISPLAY_NAME|optional|A description of the build that a given run represents|i.e `PR #26 - add unit tests`|
|ADMIRAL_RUN_ID|optional|A unique identifier to tie together multiple parallel instances of the reporter into a single report|a uuid string, i.e. `462E43EA-002B-4F4B-A711-261B9894E4AA`|
|ADMIRAL_REPORTER_DEBUG|optional|enable detailed logging for debugging|leave undefined or set to `1`|
|ADMIRAL_LOGIN|optional|login to make auth request to admiral|leave undefined or set to your login|
|ADMIRAL_PASSWORD|optional|password to make auth request to admiral|leave undefined or set to your password|

## License
Documentation in this project is licensed under Creative Commons Attribution 4.0 International License. Full details available at https://creativecommons.org/licenses/by/4.0
