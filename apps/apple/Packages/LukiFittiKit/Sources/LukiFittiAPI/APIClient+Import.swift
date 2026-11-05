import Foundation
import LukiFittiModels

/// Failures of the file import routes that the import screen explains to the user.
public enum ImportAPIError: Error, Sendable, Equatable {
    /// The file doesn't match `luki-fitti-import@1` (at most 50 issues).
    case invalidFile([ImportIssueDto])
    case tooLarge
    case rateLimited
}

private struct ImportErrorEnvelope: Decodable {
    struct Details: Decodable {
        let code: String?
        let errors: [ImportIssueDto]?
    }
    let details: Details?
}

extension APIClient {
    /// Validates an import file and reports what an import would create; writes nothing.
    /// `fileData` is the picked JSON file, uploaded unchanged.
    public func previewImport(fileData: Data) async throws -> ImportPreviewDto {
        try await sendImport(path: "/api/import/preview", fileData: fileData)
    }

    /// Imports the file; rows that already exist are skipped, so a re-import is a no-op.
    public func commitImport(fileData: Data) async throws -> ImportPreviewDto {
        try await sendImport(path: "/api/import/commit", fileData: fileData)
    }

    private func sendImport(path: String, fileData: Data) async throws -> ImportPreviewDto {
        guard fileData.count <= ImportFormat.maxBytes else { throw ImportAPIError.tooLarge }
        let data = try await send(
            path: path,
            method: "POST",
            body: fileData,
            contentType: "application/json",
            mapError: { status, body in
                switch status {
                case 413: return ImportAPIError.tooLarge
                case 429: return ImportAPIError.rateLimited
                case 400:
                    let details = (try? JSONDecoder().decode(ImportErrorEnvelope.self, from: body))?.details
                    guard details?.code == "IMPORT_INVALID_FILE" else { return nil }
                    return ImportAPIError.invalidFile(details?.errors ?? [])
                default: return nil
                }
            }
        )
        return try Self.decodeEnvelope(data)
    }
}
