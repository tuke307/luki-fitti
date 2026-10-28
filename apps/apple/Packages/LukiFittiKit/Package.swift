// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "LukiFittiKit",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v26),
        .watchOS(.v26),
        .macOS(.v15),
    ],
    products: [
        .library(
            name: "LukiFittiKit",
            targets: [
                "LukiFittiModels",
                "LukiFittiDesign",
                "LukiFittiDomain",
                "LukiFittiAPI",
                "LukiFittiStore",
                "LukiFittiHealth",
                "LukiFittiWatchSync",
            ]
        ),
        .library(name: "LukiFittiModels", targets: ["LukiFittiModels"]),
        .library(name: "LukiFittiDesign", targets: ["LukiFittiDesign"]),
        .library(name: "LukiFittiDomain", targets: ["LukiFittiDomain"]),
        .library(name: "LukiFittiAPI", targets: ["LukiFittiAPI"]),
        .library(name: "LukiFittiStore", targets: ["LukiFittiStore"]),
        .library(name: "LukiFittiHealth", targets: ["LukiFittiHealth"]),
        .library(name: "LukiFittiWatchSync", targets: ["LukiFittiWatchSync"]),
    ],
    targets: [
        .target(
            name: "LukiFittiModels",
            resources: [
                .process("Resources/starter_catalog.json"),
                .process("Resources/exercise_search.json"),
            ]
        ),
        .target(
            name: "LukiFittiDesign",
            dependencies: ["LukiFittiModels", "LukiFittiDomain"]
        ),
        .target(
            name: "LukiFittiDomain",
            dependencies: ["LukiFittiModels"]
        ),
        .target(
            name: "LukiFittiAPI",
            dependencies: ["LukiFittiModels"]
        ),
        .target(
            name: "LukiFittiStore",
            dependencies: [
                "LukiFittiModels",
                "LukiFittiDomain",
                "LukiFittiAPI",
            ]
        ),
        .target(
            name: "LukiFittiHealth",
            dependencies: [
                "LukiFittiModels",
                "LukiFittiDomain",
            ]
        ),
        .target(
            name: "LukiFittiWatchSync",
            dependencies: [
                "LukiFittiModels",
                "LukiFittiDomain",
            ]
        ),
        .testTarget(
            name: "LukiFittiDomainTests",
            dependencies: [
                "LukiFittiModels",
                "LukiFittiDomain",
                "LukiFittiDesign",
            ]
        ),
        .testTarget(
            name: "LukiFittiStoreTests",
            dependencies: [
                "LukiFittiModels",
                "LukiFittiDomain",
                "LukiFittiAPI",
                "LukiFittiStore",
                "LukiFittiWatchSync",
            ]
        ),
    ]
)
