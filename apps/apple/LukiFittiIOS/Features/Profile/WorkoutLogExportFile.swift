import SwiftUI
import UniformTypeIdentifiers
import LukiFittiModels
import LukiFittiDomain

/// Completed sets as CSV for spreadsheets, built when shared (see `WorkoutLogCSV`).
struct WorkoutLogExportFile: Transferable {
    let historySessions: [WorkoutSessionDto]
    let folders: [WorkoutFolderDto]
    let fileName = WorkoutLogCSV.fileName()

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .commaSeparatedText) { file in
            Data(WorkoutLogCSV.build(historySessions: file.historySessions, folders: file.folders).utf8)
        }
        .suggestedFileName { $0.fileName }
    }
}
