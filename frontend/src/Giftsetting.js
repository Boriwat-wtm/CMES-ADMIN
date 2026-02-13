import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL, REALTIME_URL } from "./config/apiConfig";
import "./Giftsetting.css";

const API_BASE = API_BASE_URL;

function Giftsetting() {
	const [items, setItems] = useState([]);
	const [tableCount, setTableCount] = useState(10);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [form, setForm] = useState({ name: "", price: "", description: "" });
	const [localImage, setLocalImage] = useState(null);
	const [previewUrl, setPreviewUrl] = useState("");
	const fileInputRef = useRef(null);

	const resolveImageSrc = (url) => {
		if (!url) return "";
		return url.startsWith("http") ? url : `${API_BASE}${url}`;
	};

	useEffect(() => {
		loadSettings();
	}, []);

	useEffect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	const loadSettings = async () => {
		setLoading(true);
		try {
			const response = await fetch(`${API_BASE}/api/gifts/settings`);
			const data = await response.json();
			setItems(data.items || []);
			setTableCount(data.tableCount || 10);
		} catch (error) {
			console.error("Load gift settings failed", error);
			setMessage("ไม่สามารถโหลดข้อมูลสินค้าได้");
		} finally {
			setLoading(false);
		}
	};

	const handleInputChange = (field, value) => {
		setForm((prev) => ({ ...prev, [field]: value }));
	};

	const handleAddItem = async (e) => {
		e.preventDefault();
		if (!form.name || form.price === "") {
			setMessage("กรุณากรอกชื่อและราคา (ใส่ 0 สำหรับแจกฟรี)");
			return;
		}
		if (Number(form.price) < 0) {
			setMessage("ราคาต้องไม่ติดลบ");
			return;
		}
		setSaving(true);
		setMessage("");
		try {
			let imageUrlToSave = "";
			if (localImage) {
				const uploadForm = new FormData();
				uploadForm.append("image", localImage);
				const uploadResponse = await fetch(`${API_BASE}/api/gifts/upload`, {
					method: "POST",
					body: uploadForm,
				});
				const uploadData = await uploadResponse.json();
				if (!uploadResponse.ok || !uploadData.success) {
					throw new Error(uploadData.message || "อัปโหลดรูปภาพไม่สำเร็จ");
				}
				imageUrlToSave = uploadData.url || "";
			}
			const response = await fetch(`${API_BASE}/api/gifts/items`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: form.name,
					price: Number(form.price),
					description: form.description,
					imageUrl: imageUrlToSave || "",
				}),
			});
			const data = await response.json();
			if (!response.ok || !data.success) {
				throw new Error(data.message || "เพิ่มสินค้าล้มเหลว");
			}
			setItems(data.settings.items || []);
			setForm({ name: "", price: "", description: "" });
			setLocalImage(null);
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
			setPreviewUrl("");
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			setMessage("เพิ่มสินค้าสำเร็จ");
		} catch (error) {
			console.error("Add gift item failed", error);
			setMessage(error.message || "เกิดข้อผิดพลาด");
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id) => {
		if (!window.confirm("ต้องการลบสินค้ารายการนี้หรือไม่?")) return;
		try {
			const response = await fetch(`${API_BASE}/api/gifts/items/${id}`, {
				method: "DELETE",
			});
			const data = await response.json();
			if (!response.ok || !data.success) {
				throw new Error(data.message || "ลบไม่สำเร็จ");
			}
			setItems(data.settings.items || []);
		} catch (error) {
			console.error("Delete gift item failed", error);
			setMessage(error.message || "เกิดข้อผิดพลาด");
		}
	};

	const handleTableUpdate = async () => {
		if (!tableCount || Number(tableCount) < 1) {
			setMessage("จำนวนโต๊ะต้องมากกว่า 0");
			return;
		}
		try {
			const response = await fetch(`${API_BASE}/api/gifts/table-count`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableCount: Number(tableCount) })
			});
			const data = await response.json();
			if (!response.ok || !data.success) {
				throw new Error(data.message || "บันทึกไม่สำเร็จ");
			}
			setItems(data.settings.items || []);
			setTableCount(data.settings.tableCount || tableCount);
			setMessage("อัปเดตจำนวนโต๊ะเรียบร้อย");
		} catch (error) {
			console.error("Update table count failed", error);
			setMessage(error.message || "เกิดข้อผิดพลาด");
		}
	};

	const handleFileChange = (event) => {
		const file = event.target.files?.[0];
		if (!file) {
			setLocalImage(null);
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
			setPreviewUrl("");
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			return;
		}
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		setLocalImage(file);
		setPreviewUrl(URL.createObjectURL(file));
	};

	const clearLocalImage = () => {
		setLocalImage(null);
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		setPreviewUrl("");
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	return (
		<div className="giftsetting-shell">
			<header className="giftsetting-hero">
				<div className="hero-info">
					<p className="eyebrow">CMES ADMIN</p>
					<h1>ตั้งค่าส่งของขวัญ</h1>
					<p className="subtitle">กำหนดจำนวนโต๊ะและสินค้าที่พร้อมให้ผู้ใช้เลือก</p>
				</div>
				<div className="hero-actions">
					<Link to="/home" className="ghost-link">กลับหน้าหลัก</Link>
					<button className="ghost-button" onClick={loadSettings}>
						โหลดข้อมูลล่าสุด
					</button>
				</div>
			</header>

			<main className="giftsetting-layout">
				<section className="giftsetting-panel">
					<div className="panel-head">
						<div>
							<h2>จำนวนโต๊ะที่รองรับ</h2>
							<p>กำหนดเลขโต๊ะสูงสุดสำหรับคำสั่งซื้อของผู้ใช้</p>
						</div>
						<button className="primary-button" onClick={handleTableUpdate}>
							บันทึก
						</button>
					</div>
					<div className="table-config">
						<input
							type="number"
							min="1"
							value={tableCount}
							onChange={(e) => setTableCount(e.target.value)}
						/>
						<span className="helper-text">ปัจจุบัน {tableCount} โต๊ะ</span>
					</div>
				</section>

				<section className="giftsetting-panel">
					<div className="panel-head">
						<div>
							<h2>เพิ่มรายการสินค้า</h2>
							<p>กรอกข้อมูลสินค้าเพื่อให้ผู้ใช้เลือกส่งของขวัญ</p>
						</div>
						{saving && <span className="chip">กำลังบันทึก...</span>}
					</div>
					<form className="gift-form" onSubmit={handleAddItem}>
						<div className="form-grid">
							<div className="form-field">
								<label>ชื่อสินค้า</label>
								<input
									type="text"
									value={form.name}
									onChange={(e) => handleInputChange("name", e.target.value)}
									placeholder="เช่น ช่อดอกไม้"
								/>
							</div>
							<div className="form-field">
								<label>ราคา (บาท)</label>
								<input
									type="number"
								min="0"
								value={form.price}
								onChange={(e) => handleInputChange("price", e.target.value)}
								placeholder="เช่น 150 (ใส่ 0 สำหรับแจกฟรี)"
								/>
							</div>
							<div className="form-field file-field">
								<label>อัปโหลดรูปจากเครื่อง</label>
								<input
									type="file"
									accept="image/*"
									onChange={handleFileChange}
									ref={fileInputRef}
								/>
								<small className="helper-text">เลือกรูปจากเครื่องได้หนึ่งรูป ระบบจะอัปโหลดให้อัตโนมัติ</small>
							</div>
						</div>
						{previewUrl && (
							<div className="image-preview">
								<img src={previewUrl} alt="ตัวอย่างรูป" />
								<button type="button" className="ghost-button" onClick={clearLocalImage}>
									ล้างรูป
								</button>
							</div>
						)}
						<label>รายละเอียด</label>
						<textarea
							rows="3"
							value={form.description}
							onChange={(e) => handleInputChange("description", e.target.value)}
							placeholder="คำอธิบายเพิ่มเติม"
						/>
						<button type="submit" className="primary-button" disabled={saving}>
							{saving ? "กำลังบันทึก..." : "เพิ่มสินค้า"}
						</button>
					</form>
				</section>

				<section className="giftsetting-panel">
					<div className="panel-head">
						<div>
							<h2>รายการสินค้าทั้งหมด ({items.length})</h2>
							<p>จัดการสินค้าให้พร้อมใช้งานกับระบบผู้ใช้</p>
						</div>
					</div>
					{loading ? (
						<div className="panel-empty">กำลังโหลด...</div>
					) : items.length === 0 ? (
						<div className="panel-empty">ยังไม่มีสินค้า</div>
					) : (
						<div className="gift-items-table">
							{items.map((item) => (
								<div key={item.id} className="gift-row">
									<div className="gift-row-main">
										{item.imageUrl ? (
											<img src={resolveImageSrc(item.imageUrl)} alt={item.name} className="gift-thumb" />
										) : (
											<div className="gift-thumb placeholder">
												{item.name?.charAt(0)?.toUpperCase() || "?"}
											</div>
										)}
										<div>
											<strong>{item.name}</strong>
											{item.description && <p>{item.description}</p>}
										</div>
									</div>
									<div className="gift-row-actions">
									<span className="price">{item.price === 0 ? 'ฟรี' : `฿${item.price}`}</span>
										<button className="ghost-button" onClick={() => handleDelete(item.id)}>
											ลบ
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</section>

				{message && <div className="giftsetting-alert">{message}</div>}
			</main>
		</div>
	);
}

export default Giftsetting;
