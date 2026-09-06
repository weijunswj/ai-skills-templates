use std::io::{self, Read, Write};

use github_program_broker::{
    FRAME_LENGTH_BYTES, MAX_FRAME_PAYLOAD_BYTES, Response, decode_request_frame, encode_response,
};

fn main() -> io::Result<()> {
    let mut frame = Vec::new();
    io::stdin()
        .take((FRAME_LENGTH_BYTES + MAX_FRAME_PAYLOAD_BYTES + 1) as u64)
        .read_to_end(&mut frame)?;
    let request = match decode_request_frame(&frame) {
        Ok(request) => request,
        Err(error) => {
            let response = Response::failure(error.request_id().map(str::to_owned), error.code());
            let encoded = encode_response(&response)
                .map_err(|_| io::Error::other("response encoding failed"))?;
            return io::stdout().write_all(&encoded);
        }
    };

    // Slice 1 validates the wire contract only; it does not perform provider or store work.
    let response = Response::failure(Some(request.request_id), "BROKER_UNVERIFIABLE_IDENTITY");
    let encoded =
        encode_response(&response).map_err(|_| io::Error::other("response encoding failed"))?;
    io::stdout().write_all(&encoded)
}
