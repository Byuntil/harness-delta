-- Private opaque connect proof for product resume; old bindings require reconnect.
ALTER TABLE session_bindings ADD COLUMN connect_receipt TEXT;
