# 1.0.0 (2026-11-18)


### Bug Fixes

* better projection edge handling ([cffe2dd]([secure]/commit/cffe2ddd8302e34f847befd529188a0c00a302ad))
* better projection materilaition ([f899e48]([secure]/commit/f899e48b2be25a44c1a1d74bbe5368ad2e6003db))
* collect evidence from all paths ([ab0ba40]([secure]/commit/ab0ba40bab3b7cd7fcd596f70490baba9522512c))
* correctly replace html chars in labels ([1610fc0]([secure]/commit/1610fc0acd7531f131fe13d3115e8e2a74d538a6))
* determine uninstantiated data resources in plan ([026ba50]([secure]/commit/026ba50f18cf4f85f3d5f630dd670801f21b997d))
* exclude non plan resource instances from graph ([5db11a0]([secure]/commit/5db11a0b82fa197b231b4b2ddd303ace7f1e2a40))
* force release ([268df68]([secure]/commit/268df687aeaa3458846285104ff75e3082474e88))
* force release ([d25ad99]([secure]/commit/d25ad995d97be499594767031cb6e73a45970ddd))
* force release ([0bd25d3]([secure]/commit/0bd25d3a676d81a74e224b22720303070cd05624))
* html label rendering ([73c69a4]([secure]/commit/73c69a4534c81f0e0f42ff96ac913a2da8d0f5f5))
* improve traversals using a queue instead of array functions ([fdc9b66]([secure]/commit/fdc9b66a4dd1358ec99c1cd7be000a727129d4a4))
* make EdgeDirectionSemantics not hardcoded and specific for each set of conventions ([9b35094]([secure]/commit/9b350946b951c3384bc3a27afd8378d9d242226a))
* merge conflict ([1a9b458]([secure]/commit/1a9b45814980994e8c5a1021a679711fd04788b4))
* missing export ([4a28193]([secure]/commit/4a2819388518d501f0ebc6ebf625aa6d5970cb69))
* module edge connections ([4871505]([secure]/commit/487150559697ac10093ee9f527d8c4247d22c67c))
* profile descriptor with auto generated profiles ([3f48654]([secure]/commit/3f4865490abad58bc0fa71dadedfe43f1637c152))
* projection materialisation ([9cd596a]([secure]/commit/9cd596a1422b6638545aa6dbd774dd9a74d78781))
* projection semantics use full dsl ([2cbd6bc]([secure]/commit/2cbd6bc635a810010260ed182add67ada55035c3))
* remove adjaceny concept for projection edge determination ([e4c73a7]([secure]/commit/e4c73a72e14834d3bb3025be4df54743fcb281e6))
* Supporting memberships disappear during instance materialization ([d1e81cf]([secure]/commit/d1e81cfdfc710ba8b047ccb6736a97dbc0fe7454))
* test coverage ([0d14c02]([secure]/commit/0d14c0204a528ab9eeee297d4ca3e4e0acb9a148))
* tests ([518a25c]([secure]/commit/518a25c7848659a22ec0e9d6d56ae96fc563282a))
* topology fixes ([fb90de1]([secure]/commit/fb90de11eaa53b9e40d2b15cdd55c986a77b50ad))
* type error ([60b4a41]([secure]/commit/60b4a41a4d7d206448f5b9a25841b2e8a1849735))


### Features

* 1.0.0 release candidate ([d68d359]([secure]/commit/d68d359a0f8a90563d883fff2e8bb83007a47fd3))
* add decorator for TgGraph including tf state ([de5874c]([secure]/commit/de5874cc173228a52c441e7b0729774294a9530d))
* add initial topology hinting ([b39efe0]([secure]/commit/b39efe0b76ba2658782c0256e7e242e7dd53e4c5))
* add layout hints for topology management ([0784aa7]([secure]/commit/0784aa73f0c6a480eeaf57d0e2aa04e2b0e28d32))
* add profile execution descriptor ([fb247e4]([secure]/commit/fb247e49eeb5ded11fc25a52c38e289aaf3b325d))
* add projection nodes rules ([eda24e6]([secure]/commit/eda24e6dd40e984ef69764bf747db0a0ff8f08dc))
* add slot for profiles, allowing override ([d2b8e8b]([secure]/commit/d2b8e8bf4fa149fb762ca6e4f44bc952dbc665da))
* add writers and renderers to runtime providers ([4100a66]([secure]/commit/4100a662da9dbbc10b2f7fb24575bf16d8d1b73a))
* added external module loading for providers ([090fac2]([secure]/commit/090fac2ba5beda79a2b4aeb62518c95bf7dacdb3))
* address loopback edges ([48a8de0]([secure]/commit/48a8de0c237891d711afe287fa2703bb5efe2637))
* allow force overwriting the dot label ([9cc5876]([secure]/commit/9cc58766c399b06670d72cf08951f913111237b4))
* better array matching ([df16c85]([secure]/commit/df16c855a3ef31c0857ad01f6c137bf0d50a99df))
* better layout ([73a193c]([secure]/commit/73a193cd76c34418248f4863a67c4b7fdab26bb8))
* better node image and label layout ([b2099f4]([secure]/commit/b2099f475ba551d9548ea99a0dae8f97253d4043))
* better semantics model ([bc253f4]([secure]/commit/bc253f4d498eb71bee983464f57e071e980339d1))
* better tf state semantics ([eac468c]([secure]/commit/eac468cb1c15525d49737dd21ad04a81efc20f76))
* change the way projections handle cardianlity ([edc6f5c]([secure]/commit/edc6f5c2b6801692a89f2931c2c0c6adf5f41f38))
* edge semantics ([49fea7d]([secure]/commit/49fea7d79fc6af62975a5530f97de066033deec7))
* improved provider resolution ([60913dc]([secure]/commit/60913dcd1fe1ac45459859614f6292b26185cd11))
* initial setup for alternative projection building methods ([61770d1]([secure]/commit/61770d12d14b25605ef312c4f662b1a229eca64a))
* introduce fact based semantics derived from plan data ([45a6d48]([secure]/commit/45a6d485a838d4b2dcf0d7e1496c7ffa88e4fd55))
* refactor projection semantics ([b193d45]([secure]/commit/b193d45b395bee4e16280618c72df704f6334b46))
* removed unused version.parentId ([f22ffce]([secure]/commit/f22ffcec6abe72bbbc2acf8ee000c83838cc974f))
* stronger projection semantics ([bef2777]([secure]/commit/bef2777e24670f37163f938d30ac68be172260ec))
* switch to rule-major processing ([a98255c]([secure]/commit/a98255cd381e30a801f18acca35c947e2c1035d4))
* tf plan changes diff ([0ff1f15]([secure]/commit/0ff1f15131ac394abd6f255f4049711c5098df95))
* use hints for influencing node rendering layout ([0deab63]([secure]/commit/0deab63dc6c34af94d42058eac906a0f3ddf055a))
* v1 release ([#1]([secure]/issues/1)) ([77c91f5]([secure]/commit/77c91f5475076ce55cb51bd69e93006c3d978baf))

# [1.0.0-rc.31]([secure]/compare/v1.0.0-rc.30...v1.0.0-rc.31) (2026-11-18)


### Bug Fixes

* determine uninstantiated data resources in plan ([026ba50]([secure]/commit/026ba50f18cf4f85f3d5f630dd670801f21b997d))
* exclude non plan resource instances from graph ([5db11a0]([secure]/commit/5db11a0b82fa197b231b4b2ddd303ace7f1e2a40))
* improve traversals using a queue instead of array functions ([fdc9b66]([secure]/commit/fdc9b66a4dd1358ec99c1cd7be000a727129d4a4))
* profile descriptor with auto generated profiles ([3f48654]([secure]/commit/3f4865490abad58bc0fa71dadedfe43f1637c152))
* projection materialisation ([9cd596a]([secure]/commit/9cd596a1422b6638545aa6dbd774dd9a74d78781))
* Supporting memberships disappear during instance materialization ([d1e81cf]([secure]/commit/d1e81cfdfc710ba8b047ccb6736a97dbc0fe7454))


### Features

* add profile execution descriptor ([fb247e4]([secure]/commit/fb247e49eeb5ded11fc25a52c38e289aaf3b325d))
* initial setup for alternative projection building methods ([61770d1]([secure]/commit/61770d12d14b25605ef312c4f662b1a229eca64a))
* removed unused version.parentId ([f22ffce]([secure]/commit/f22ffcec6abe72bbbc2acf8ee000c83838cc974f))
* tf plan changes diff ([0ff1f15]([secure]/commit/0ff1f15131ac394abd6f255f4049711c5098df95))

# [1.0.0-rc.30](https://github.com/terra-graph/core/compare/v1.0.0-rc.29...v1.0.0-rc.30) (2026-06-07)


### Features

* stronger projection semantics ([bef2777](https://github.com/terra-graph/core/commit/bef2777e24670f37163f938d30ac68be172260ec))

# [1.0.0-rc.29](https://github.com/terra-graph/core/compare/v1.0.0-rc.28...v1.0.0-rc.29) (2026-06-05)


### Features

* better tf state semantics ([eac468c](https://github.com/terra-graph/core/commit/eac468cb1c15525d49737dd21ad04a81efc20f76))

# [1.0.0-rc.28](https://github.com/terra-graph/core/compare/v1.0.0-rc.27...v1.0.0-rc.28) (2026-06-02)


### Bug Fixes

* module edge connections ([4871505](https://github.com/terra-graph/core/commit/487150559697ac10093ee9f527d8c4247d22c67c))


### Features

* introduce fact based semantics derived from plan data ([45a6d48](https://github.com/terra-graph/core/commit/45a6d485a838d4b2dcf0d7e1496c7ffa88e4fd55))

# [1.0.0-rc.27](https://github.com/terra-graph/core/compare/v1.0.0-rc.26...v1.0.0-rc.27) (2026-05-25)


### Bug Fixes

* remove adjaceny concept for projection edge determination ([e4c73a7](https://github.com/terra-graph/core/commit/e4c73a72e14834d3bb3025be4df54743fcb281e6))

# [1.0.0-rc.26](https://github.com/terra-graph/core/compare/v1.0.0-rc.25...v1.0.0-rc.26) (2026-05-22)


### Bug Fixes

* better projection materilaition ([f899e48](https://github.com/terra-graph/core/commit/f899e48b2be25a44c1a1d74bbe5368ad2e6003db))

# [1.0.0-rc.25](https://github.com/terra-graph/core/compare/v1.0.0-rc.24...v1.0.0-rc.25) (2026-05-22)


### Features

* add writers and renderers to runtime providers ([4100a66](https://github.com/terra-graph/core/commit/4100a662da9dbbc10b2f7fb24575bf16d8d1b73a))
* change the way projections handle cardianlity ([edc6f5c](https://github.com/terra-graph/core/commit/edc6f5c2b6801692a89f2931c2c0c6adf5f41f38))

# [1.0.0-rc.24](https://github.com/terra-graph/core/compare/v1.0.0-rc.23...v1.0.0-rc.24) (2026-05-12)


### Bug Fixes

* collect evidence from all paths ([ab0ba40](https://github.com/terra-graph/core/commit/ab0ba40bab3b7cd7fcd596f70490baba9522512c))

# [1.0.0-rc.23](https://github.com/terra-graph/core/compare/v1.0.0-rc.22...v1.0.0-rc.23) (2026-05-11)


### Features

* better array matching ([df16c85](https://github.com/terra-graph/core/commit/df16c855a3ef31c0857ad01f6c137bf0d50a99df))
* switch to rule-major processing ([a98255c](https://github.com/terra-graph/core/commit/a98255cd381e30a801f18acca35c947e2c1035d4))

# [1.0.0-rc.22](https://github.com/terra-graph/core/compare/v1.0.0-rc.21...v1.0.0-rc.22) (2026-05-11)


### Bug Fixes

* projection semantics use full dsl ([2cbd6bc](https://github.com/terra-graph/core/commit/2cbd6bc635a810010260ed182add67ada55035c3))
* tests ([518a25c](https://github.com/terra-graph/core/commit/518a25c7848659a22ec0e9d6d56ae96fc563282a))

# [1.0.0-rc.21](https://github.com/terra-graph/core/compare/v1.0.0-rc.20...v1.0.0-rc.21) (2026-05-10)


### Bug Fixes

* better projection edge handling ([cffe2dd](https://github.com/terra-graph/core/commit/cffe2ddd8302e34f847befd529188a0c00a302ad))

# [1.0.0-rc.20](https://github.com/terra-graph/core/compare/v1.0.0-rc.19...v1.0.0-rc.20) (2026-05-09)


### Bug Fixes

* test coverage ([0d14c02](https://github.com/terra-graph/core/commit/0d14c0204a528ab9eeee297d4ca3e4e0acb9a148))


### Features

* add projection nodes rules ([eda24e6](https://github.com/terra-graph/core/commit/eda24e6dd40e984ef69764bf747db0a0ff8f08dc))
* refactor projection semantics ([b193d45](https://github.com/terra-graph/core/commit/b193d45b395bee4e16280618c72df704f6334b46))

# [1.0.0-rc.19](https://github.com/terra-graph/core/compare/v1.0.0-rc.18...v1.0.0-rc.19) (2026-05-05)


### Features

* edge semantics ([49fea7d](https://github.com/terra-graph/core/commit/49fea7d79fc6af62975a5530f97de066033deec7))

# [1.0.0-rc.18](https://github.com/terra-graph/core/compare/v1.0.0-rc.17...v1.0.0-rc.18) (2026-05-01)


### Features

* better layout ([73a193c](https://github.com/terra-graph/core/commit/73a193cd76c34418248f4863a67c4b7fdab26bb8))
* better semantics model ([bc253f4](https://github.com/terra-graph/core/commit/bc253f4d498eb71bee983464f57e071e980339d1))

# [1.0.0-rc.17](https://github.com/terra-graph/core/compare/v1.0.0-rc.16...v1.0.0-rc.17) (2026-04-28)


### Bug Fixes

* merge conflict ([1a9b458](https://github.com/terra-graph/core/commit/1a9b45814980994e8c5a1021a679711fd04788b4))


### Features

* better node image and label layout ([b2099f4](https://github.com/terra-graph/core/commit/b2099f475ba551d9548ea99a0dae8f97253d4043))

# [1.0.0-rc.16](https://github.com/terra-graph/core/compare/v1.0.0-rc.15...v1.0.0-rc.16) (2026-04-28)


### Features

* use hints for influencing node rendering layout ([0deab63](https://github.com/terra-graph/core/commit/0deab63dc6c34af94d42058eac906a0f3ddf055a))

# [1.0.0-rc.15](https://github.com/terra-graph/core/compare/v1.0.0-rc.14...v1.0.0-rc.15) (2026-04-27)


### Bug Fixes

* type error ([60b4a41](https://github.com/terra-graph/core/commit/60b4a41a4d7d206448f5b9a25841b2e8a1849735))


### Features

* add layout hints for topology management ([0784aa7](https://github.com/terra-graph/core/commit/0784aa73f0c6a480eeaf57d0e2aa04e2b0e28d32))
* improved provider resolution ([60913dc](https://github.com/terra-graph/core/commit/60913dcd1fe1ac45459859614f6292b26185cd11))

# [1.0.0-rc.14](https://github.com/terra-graph/core/compare/v1.0.0-rc.13...v1.0.0-rc.14) (2026-04-25)


### Bug Fixes

* topology fixes ([fb90de1](https://github.com/terra-graph/core/commit/fb90de11eaa53b9e40d2b15cdd55c986a77b50ad))

# [1.0.0-rc.13](https://github.com/terra-graph/core/compare/v1.0.0-rc.12...v1.0.0-rc.13) (2026-04-23)


### Features

* add initial topology hinting ([b39efe0](https://github.com/terra-graph/core/commit/b39efe0b76ba2658782c0256e7e242e7dd53e4c5))

# [1.0.0-rc.12](https://github.com/terra-graph/core/compare/v1.0.0-rc.11...v1.0.0-rc.12) (2026-04-23)


### Bug Fixes

* html label rendering ([73c69a4](https://github.com/terra-graph/core/commit/73c69a4534c81f0e0f42ff96ac913a2da8d0f5f5))


### Features

* add slot for profiles, allowing override ([d2b8e8b](https://github.com/terra-graph/core/commit/d2b8e8bf4fa149fb762ca6e4f44bc952dbc665da))

# [1.0.0-rc.11](https://github.com/terra-graph/core/compare/v1.0.0-rc.10...v1.0.0-rc.11) (2026-04-23)


### Features

* address loopback edges ([48a8de0](https://github.com/terra-graph/core/commit/48a8de0c237891d711afe287fa2703bb5efe2637))

# [1.0.0-rc.10](https://github.com/terra-graph/core/compare/v1.0.0-rc.9...v1.0.0-rc.10) (2026-04-21)


### Features

* add decorator for TgGraph including tf state ([de5874c](https://github.com/terra-graph/core/commit/de5874cc173228a52c441e7b0729774294a9530d))

# [1.0.0-rc.9](https://github.com/terra-graph/core/compare/v1.0.0-rc.8...v1.0.0-rc.9) (2026-04-17)


### Bug Fixes

* make EdgeDirectionSemantics not hardcoded and specific for each set of conventions ([9b35094](https://github.com/terra-graph/core/commit/9b350946b951c3384bc3a27afd8378d9d242226a))

# [1.0.0-rc.8](https://github.com/terra-graph/core/compare/v1.0.0-rc.7...v1.0.0-rc.8) (2026-04-09)


### Bug Fixes

* missing export ([4a28193](https://github.com/terra-graph/core/commit/4a2819388518d501f0ebc6ebf625aa6d5970cb69))

# [1.0.0-rc.7](https://github.com/terra-graph/core/compare/v1.0.0-rc.6...v1.0.0-rc.7) (2026-04-09)


### Bug Fixes

* correctly replace html chars in labels ([1610fc0](https://github.com/terra-graph/core/commit/1610fc0acd7531f131fe13d3115e8e2a74d538a6))

# [1.0.0-rc.6](https://github.com/terra-graph/core/compare/v1.0.0-rc.5...v1.0.0-rc.6) (2026-04-09)


### Features

* allow force overwriting the dot label ([9cc5876](https://github.com/terra-graph/core/commit/9cc58766c399b06670d72cf08951f913111237b4))

# [1.0.0-rc.5](https://github.com/terra-graph/core/compare/v1.0.0-rc.4...v1.0.0-rc.5) (2026-03-29)


### Features

* added external module loading for providers ([090fac2](https://github.com/terra-graph/core/commit/090fac2ba5beda79a2b4aeb62518c95bf7dacdb3))

# [1.0.0-rc.4](https://github.com/terra-graph/core/compare/v1.0.0-rc.3...v1.0.0-rc.4) (2026-03-25)


### Bug Fixes

* force release ([268df68](https://github.com/terra-graph/core/commit/268df687aeaa3458846285104ff75e3082474e88))

# [1.0.0-rc.3](https://github.com/terra-graph/core/compare/v1.0.0-rc.2...v1.0.0-rc.3) (2026-03-25)


### Bug Fixes

* force release ([d25ad99](https://github.com/terra-graph/core/commit/d25ad995d97be499594767031cb6e73a45970ddd))

# [1.0.0-rc.2](https://github.com/terra-graph/core/compare/v1.0.0-rc.1...v1.0.0-rc.2) (2026-03-25)


### Bug Fixes

* force release ([0bd25d3](https://github.com/terra-graph/core/commit/0bd25d3a676d81a74e224b22720303070cd05624))

# 1.0.0-rc.1 (2026-03-25)


### Features

* 1.0.0 release candidate ([d68d359](https://github.com/terra-graph/core/commit/d68d359a0f8a90563d883fff2e8bb83007a47fd3))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-03-25

### Added
- Initial migration / port from `@kevbaldwyn/terra-graph`.
