# Changelog

## [1.1.1](https://github.com/procyon-creative/procyon-wp/compare/v1.1.0...v1.1.1) (2026-09-03)


### Bug Fixes

* **cli:** render command positionals under Positionals in help ([#22](https://github.com/procyon-creative/procyon-wp/issues/22)) ([1272307](https://github.com/procyon-creative/procyon-wp/commit/127230746a92cde9938ff18fb2c887693b94112a))
* **config:** warn before overwriting or duplicating a project ([#24](https://github.com/procyon-creative/procyon-wp/issues/24)) ([f83e1d6](https://github.com/procyon-creative/procyon-wp/commit/f83e1d6db0a8cfc1dba79d1817312f157ad5591d))

## [1.1.0](https://github.com/procyon-creative/procyon-wp/compare/v1.0.5...v1.1.0) (2026-08-13)


### Features

* **files:** add read-only content diff analysis ([f9d4018](https://github.com/procyon-creative/procyon-wp/commit/f9d4018544977bd230a4f37a17815c3add4a74f2))
* **files:** add read-only content diff analysis ([dcf2cb9](https://github.com/procyon-creative/procyon-wp/commit/dcf2cb9ba0c2242f3da67789c0d0318f5d5be522))


### Bug Fixes

* **files:** harden read-only diff analysis ([92b995c](https://github.com/procyon-creative/procyon-wp/commit/92b995cb35cc323d823629627a8cda56c959fe3d))


### Performance Improvements

* **files:** bound and batch remote diff analysis ([4c2f8fd](https://github.com/procyon-creative/procyon-wp/commit/4c2f8fd5aa3e4c768493e7bd2cb06a91a014c824))

## [1.0.5](https://github.com/procyon-creative/procyon-wp/compare/v1.0.4...v1.0.5) (2026-05-19)


### Bug Fixes

* **ci:** drop PAT from release-please, use default GITHUB_TOKEN ([#15](https://github.com/procyon-creative/procyon-wp/issues/15)) ([b9676f3](https://github.com/procyon-creative/procyon-wp/commit/b9676f338deb22a3a10ed37618e0ebb96f5d0327))
* use yargs main entry to support Node 26 (PWC-1) ([#17](https://github.com/procyon-creative/procyon-wp/issues/17)) ([e2c9ff4](https://github.com/procyon-creative/procyon-wp/commit/e2c9ff4942e239831e0ba94882e322bb1de019d8))

## [1.0.4](https://github.com/procyon-creative/procyon-wp/compare/v1.0.3...v1.0.4) (2026-05-18)


### Bug Fixes

* remove node_modules/ from default rsync excludes ([#12](https://github.com/procyon-creative/procyon-wp/issues/12)) ([0024567](https://github.com/procyon-creative/procyon-wp/commit/002456799927a7995784f01fa6afcc5307abc2a1))

## [1.0.3](https://github.com/procyon-creative/procyon-wp/compare/v1.0.2...v1.0.3) (2026-04-15)


### Miscellaneous Chores

* bump to 1.0.3 to skip existing npm versions ([#10](https://github.com/procyon-creative/procyon-wp/issues/10)) ([126160c](https://github.com/procyon-creative/procyon-wp/commit/126160c8379a79e09805378ad44381482cf85d41))

## [1.0.2](https://github.com/procyon-creative/procyon-wp/compare/v1.0.1...v1.0.2) (2026-04-15)


### Bug Fixes

* use node 24 for built-in npm 11 (OIDC trusted publishing) ([#8](https://github.com/procyon-creative/procyon-wp/issues/8)) ([4df80b3](https://github.com/procyon-creative/procyon-wp/commit/4df80b3d077e60abedcf7cc0ad622e3857bad994))

## [1.0.1](https://github.com/procyon-creative/procyon-wp/compare/v1.0.0...v1.0.1) (2026-04-15)


### Bug Fixes

* upgrade to node 22 + npm@latest for OIDC trusted publishing ([#7](https://github.com/procyon-creative/procyon-wp/issues/7)) ([43ecfa9](https://github.com/procyon-creative/procyon-wp/commit/43ecfa97511de6af2c477a25c925548a4e76b56b))

## 1.0.0 (2026-04-15)


### Bug Fixes

* skip backup when pushing new files that don't exist on remote ([96a29f7](https://github.com/procyon-creative/procyon-wp/commit/96a29f7d0b5823d137344c1cad77ef6fa68e64ad))
* use PAT for release-please to bypass org PR restriction ([9dfb1b0](https://github.com/procyon-creative/procyon-wp/commit/9dfb1b0bbb179270d1f9eb0b764f6280680acb9e))
* use PAT for release-please to bypass org PR restriction ([ca4bd6f](https://github.com/procyon-creative/procyon-wp/commit/ca4bd6f3ecdd0e65c85a9ab7aed5da5972bf7167))
